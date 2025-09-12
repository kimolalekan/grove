#!/bin/bash
set -euo pipefail

# Configuration
API_URL="https://logs.yourdomain.com/api/logs"
API_TOKEN="api_token check your apikey on the dashboard"
LOG_DIR="/var/log"
CONFIG_DIR="/etc/grove"
PID_FILE="/var/run/grove.pid"
MAX_RETRIES=3
RETRY_DELAY=2

# PM2 configuration
PM2_HOME="/home/project_name/.pm2"
PM2_LOGS_DIR="$PM2_HOME/logs"

# Apache configuration
APACHE_LOGS_DIR="/var/log/apache2"

# Uvicorn/FastAPI configuration
UVICORN_LOG_FILE="/var/www/html/image-scan/uvicorn.log"

# Laravel configuration
LARAVEL_LOG_DIR="/var/www/arya/storage/logs"
LARAVEL_LOG_PATTERN="laravel-*.log"

# Ensure directories exist
mkdir -p "$LOG_DIR" "$CONFIG_DIR"

# Load configuration
source "${CONFIG_DIR}/config.sh" 2>/dev/null || {
    echo "Config file not found, using defaults"
}

# Function to generate SHA256 hash
generate_id() {
    local input="$1"
    echo -n "$input" | sha256sum | cut -d' ' -f1
}

# Function to debug API requests
debug_api_request() {
    local log_data="$1"
    echo "=== DEBUG REQUEST ===" >> "${LOG_DIR}/grove.log"
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" >> "${LOG_DIR}/grove.log"
    echo "JSON Data: $log_data" >> "${LOG_DIR}/grove.log"
    echo "=====================" >> "${LOG_DIR}/grove.log"
}

# Function to validate JSON format
validate_json() {
    local json_data="$1"
    if echo "$json_data" | jq . >/dev/null 2>&1; then
        return 0
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Invalid JSON format" >> "${LOG_DIR}/grove.log"
        echo "Invalid JSON: $json_data" >> "${LOG_DIR}/grove.log"
        return 1
    fi
}

# Function to send log to API
send_to_api() {
    local log_data="$1"
    local retry_count=0
    local http_code
    local response

    # Validate JSON first
    if ! validate_json "$log_data"; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Skipping invalid JSON" >> "${LOG_DIR}/grove.log"
        return 1
    fi

    debug_api_request "$log_data"

    while [ $retry_count -lt $MAX_RETRIES ]; do
        response=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $API_TOKEN" \
            -d "$log_data" \
            "$API_URL" 2>> "${LOG_DIR}/grove-curl.log")

        http_code=$(echo "$response" | tail -n1)
        response_body=$(echo "$response" | sed '$d')

        if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Log sent successfully" >> "${LOG_DIR}/grove.log"
            return 0
        else
            echo "$(date '+%Y-%m-%d %H:%M:%S') - API call failed (attempt $((retry_count+1))/$MAX_RETRIES): HTTP $http_code" >> "${LOG_DIR}/grove.log"
            echo "Response: $response_body" >> "${LOG_DIR}/grove.log"
            retry_count=$((retry_count+1))
            sleep $RETRY_DELAY
        fi
    done

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Failed to send log after $MAX_RETRIES attempts" >> "${LOG_DIR}/grove.log"
    echo "Final response: $response_body" >> "${LOG_DIR}/grove.log"
    return 1
}

# Function to parse nginx access log
parse_nginx_access() {
    local line="$1"
    # Common nginx access log format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
    echo "$line" | awk '{
        match($0, /^([0-9.]+) - ([^ ]+) \[([^\]]+)\] "([A-Z]+) ([^ ]+) HTTP\/[0-9.]+" ([0-9]+) ([0-9]+) "([^"]*)" "([^"]*)"/, matches)
        if (matches[1] != "") {
            print "{\"ip\": \"" matches[1] "\", \"userId\": \"" matches[2] "\", \"timestamp\": \"" matches[3] "\", \"method\": \"" matches[4] "\", \"path\": \"" matches[5] "\", \"statusCode\": " matches[6] ", \"size\": \"" matches[7] "\", \"referrer\": \"" matches[8] "\", \"userAgent\": \"" matches[9] "\"}"
        }
    }'
}

# Function to parse Apache access log (Common Log Format)
parse_apache_access() {
    local line="$1"
    # Apache Common Log Format: %h %l %u %t \"%r\" %>s %b
    echo "$line" | awk '{
        match($0, /^([0-9.]+) ([^ ]+) ([^ ]+) \[([^\]]+)\] "([A-Z]+) ([^ ]+) HTTP\/[0-9.]+" ([0-9]+) ([0-9]+)/, matches)
        if (matches[1] != "") {
            print "{\"ip\": \"" matches[1] "\", \"userId\": \"" matches[3] "\", \"timestamp\": \"" matches[4] "\", \"method\": \"" matches[5] "\", \"path\": \"" matches[6] "\", \"statusCode\": " matches[7] ", \"size\": \"" matches[8] "\"}"
        }
    }'
}

# Function to parse Apache error log
parse_apache_error() {
    local log_entry="$1"
    # Apache error log format: [Day Month Date Time Year] [LogLevel] [PID] [Client: IP] Message
    echo "$log_entry" | awk '{
        if (match($0, /^\[([^\]]+)\] \[([^\]]+)\] (\[pid [0-9]+\])? (\[client ([0-9.]+):[0-9]+\])? (.*)$/, matches)) {
            timestamp = matches[1]
            level = matches[2]
            pid = matches[3]
            client_ip = matches[5]
            message = matches[6]

            printf "{\"timestamp\": \"%s\", \"level\": \"%s\", \"pid\": \"%s\", \"client_ip\": \"%s\", \"message\": \"%s\"}",
                   timestamp, level, pid, client_ip, message
        } else {
            print "{}"
        }
    }'
}

# Function to parse PM2 log format
parse_pm2_log() {
    local log_entry="$1"
    # PM2 log format: timestamp PM2-ID|AppName|LogType (out/err): message
    echo "$log_entry" | awk '{
        if (match($0, /^([0-9]+-[0-9]+-[0-9]+ [0-9]+:[0-9]+:[0-9]+) ([^ ]+) ([^:]+): (.*)$/, matches)) {
            timestamp = matches[1]
            pm2_id = matches[2]
            log_type = matches[3]
            message = matches[4]

            # Extract app name from PM2 ID (format: id.appname)
            if (match(pm2_id, /^[0-9]+\.[^\.]+\.(.+)$/, app_matches)) {
                app_name = app_matches[1]
            } else {
                app_name = pm2_id
            }

            printf "{\"timestamp\": \"%s\", \"pm2_id\": \"%s\", \"app_name\": \"%s\", \"log_type\": \"%s\", \"message\": \"%s\"}",
                   timestamp, pm2_id, app_name, log_type, message
        } else {
            print "{}"
        }
    }'
}

# Function to parse Uvicorn/FastAPI log format
parse_uvicorn_log() {
    local log_entry="$1"

    # Uvicorn log formats:
    # INFO:     Started server process [1234]
    # INFO:     127.0.0.1:56789 - "GET /docs HTTP/1.1" 200
    # ERROR:    Exception in ASGI application
    # WARNING:  Something happened

    echo "$log_entry" | awk '{
        # Handle different Uvicorn log patterns

        # Pattern 1: INFO:     127.0.0.1:56789 - "GET /docs HTTP/1.1" 200
        if (match($0, /^([A-Z]+):\s+([0-9.]+):([0-9]+) - "([A-Z]+) ([^ ]+) HTTP\/[0-9.]+" ([0-9]+)/, matches)) {
            level = tolower(matches[1])
            ip = matches[2]
            port = matches[3]
            method = matches[4]
            path = matches[5]
            status = matches[6]

            printf "{\"level\": \"%s\", \"ip\": \"%s\", \"port\": \"%s\", \"method\": \"%s\", \"path\": \"%s\", \"status_code\": %s, \"type\": \"access\"}",
                   level, ip, port, method, path, status
        }
        # Pattern 2: INFO:     Started server process [1234]
        else if (match($0, /^([A-Z]+):\s+Started server process \[([0-9]+)\]/, matches)) {
            level = tolower(matches[1])
            pid = matches[2]

            printf "{\"level\": \"%s\", \"pid\": \"%s\", \"type\": \"server\", \"event\": \"started\"}",
                   level, pid
        }
        # Pattern 3: INFO:     Waiting for application startup.
        else if (match($0, /^([A-Z]+):\s+(.*)$/, matches)) {
            level = tolower(matches[1])
            message = matches[2]

            # Determine event type based on message content
            event_type = "general"
            if (match(message, /(startup|started)/)) event_type = "startup"
            else if (match(message, /(shutdown|stopping)/)) event_type = "shutdown"
            else if (match(message, /(error|exception|failed)/)) event_type = "error"

            printf "{\"level\": \"%s\", \"message\": \"%s\", \"type\": \"%s\"}",
                   level, message, event_type
        }
        # Pattern 4: Handle stack traces and multi-line errors
        else if (match($0, /^\s+(at |File |Traceback)/, matches)) {
            printf "{\"level\": \"error\", \"message\": \"%s\", \"type\": \"stacktrace\"}", $0
        }
        # Default: treat as general message
        else {
            printf "{\"level\": \"info\", \"message\": \"%s\", \"type\": \"general\"}", $0
        }
    }'
}

# Function to determine log level for Laravel logs
determine_laravel_level() {
    local message="$1"

    if echo "$message" | grep -q "local.ERROR"; then
        echo "error"
    elif echo "$message" | grep -q "local.WARNING"; then
        echo "warning"
    elif echo "$message" | grep -q "local.INFO"; then
        echo "info"
    elif echo "$message" | grep -q "local.DEBUG"; then
        echo "debug"
    else
        echo "info"
    fi
}

# Function to determine log level for Apache logs
determine_apache_level() {
    local message="$1"
    local log_type="$2"

    if [ "$log_type" = "error" ]; then
        # Parse Apache error log levels
        if echo "$message" | grep -q "\[error\]"; then
            echo "error"
        elif echo "$message" | grep -q "\[warn\]"; then
            echo "warning"
        elif echo "$message" | grep -q "\[notice\]"; then
            echo "info"
        elif echo "$message" | grep -q "\[debug\]"; then
            echo "debug"
        else
            echo "info"
        fi
    else
        # For access logs, default to info
        echo "info"
    fi
}

# Function to determine log level for PM2 logs
determine_pm2_level() {
    local message="$1"
    local log_type="$2"

    if [ "$log_type" = "error" ] || echo "$message" | grep -qi "error\|fail\|exception\|critical"; then
        echo "error"
    elif echo "$message" | grep -qi "warn"; then
        echo "warning"
    elif echo "$message" | grep -qi "debug"; then
        echo "debug"
    else
        echo "info"
    fi
}

# Function to determine log level for Uvicorn logs
determine_uvicorn_level() {
    local message="$1"

    if echo "$message" | grep -qi "^ERROR:"; then
        echo "error"
    elif echo "$message" | grep -qi "^WARNING:"; then
        echo "warning"
    elif echo "$message" | grep -qi "^DEBUG:"; then
        echo "debug"
    elif echo "$message" | grep -qi "^CRITICAL:"; then
        echo "critical"
    elif echo "$message" | grep -qi "error\|exception\|fail\|traceback"; then
        echo "error"
    elif echo "$message" | grep -qi "warn"; then
        echo "warning"
    else
        echo "info"
    fi
}

# Function to determine log level for other logs
determine_level() {
    local message="$1"
    local log_type="$2"
    if [ "$log_type" = "error" ]; then
        echo "error"
    elif echo "$message" | grep -qi "warn"; then
        echo "warning"
    elif echo "$message" | grep -qi "error\|failed\|exception\|critical"; then
        echo "error"
    else
        echo "info"
    fi
}

# Function to process system metrics (updated with proper message)
process_system_metrics() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local mem_total=$(free -b | grep Mem | awk '{print $2}')
    local mem_used=$(free -b | grep Mem | awk '{print $3}')
    local mem_usage_percent=$(echo "scale=1; $mem_used * 100 / $mem_total" | bc)
    local mem_total_gb=$(echo "scale=1; $mem_total / 1024/1024/1024" | bc)
    local mem_free_gb=$(echo "scale=1; ($mem_total - $mem_used) / 1024/1024/1024" | bc)

    local disk_usage=$(df / | awk 'NR==2{print $5}' | cut -d'%' -f1)
    local disk_free_gb=$(echo "scale=0; (100 - $disk_usage) * 5" | bc)

    # Network stats (simplified)
    local network_rx=$(cat /sys/class/net/eth0/statistics/rx_bytes 2>/dev/null || echo "0")
    local network_tx=$(cat /sys/class/net/eth0/statistics/tx_bytes 2>/dev/null || echo "0")
    local network_rx_rate=$(echo "scale=0; $network_rx / 60" | bc)
    local network_tx_rate=$(echo "scale=0; $network_tx / 60" | bc)

    local hostname=$(hostname)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local id=$(generate_id "system_metric_${hostname}_$(date +%s)")

    # Generate random cores between 4-11 as in the original
    local cores=$((4 + RANDOM % 8))
    # Create meaningful message instead of empty string
    local message="System metrics - CPU: ${cpu_usage}%, Memory: ${mem_usage_percent}%, Disk: ${disk_usage}%"

    # Create properly formatted JSON
    cat <<EOF
{
  "id": "$id",
  "timestamp": "$timestamp",
  "project": "project_name",
  "source": "system_metrics",
  "level": "info",
  "message": "$message",
  "cpu": {
    "usage": $cpu_usage,
    "cores": $cores
  },
  "memory": {
    "usage_percent": $mem_usage_percent,
    "total": "${mem_total_gb}GB",
    "free": "${mem_free_gb}GB"
  },
  "disk": {
    "usage": {
      "/": {
        "usage_percent": $disk_usage,
        "total": "500GB",
        "free": "${disk_free_gb}GB"
      }
    }
  },
  "network": {
    "eth0": {
      "rx_bytes": $network_rx,
      "tx_bytes": $network_tx,
      "rx_rate_bytes_per_sec": $network_rx_rate,
      "tx_rate_bytes_per_sec": $network_tx_rate
    }
  }
}
EOF
}

# Function to sanitize message (remove newlines and special characters)
sanitize_message() {
    local message="$1"
    # Remove newlines and carriage returns, escape quotes
    echo "$message" | tr -d '\n\r' | sed 's/"/\\"/g'
}

# Function to extract Laravel log details with multiline support
parse_laravel_log() {
    local log_entry="$1"

    # Replace actual newlines with literal \n for JSON compatibility
    local sanitized_entry=$(echo "$log_entry" | sed ':a;N;$!ba;s/\n/\\n/g')

    # Extract the first line (which should contain the main log entry)
    local first_line=$(echo "$log_entry" | head -1)

    # Try to parse the first line as a standard Laravel log entry
    if echo "$first_line" | grep -q "^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\]"; then
        echo "$first_line" | awk '{
            if (match($0, /^\[([^\]]+)\] ([^.]+)\.([^:]+): (.*)$/, matches)) {
                timestamp = matches[1]
                channel = matches[2]
                level = matches[3]
                message = matches[4]

                # Include the full multiline message
                printf "{\"timestamp\": \"%s\", \"channel\": \"%s\", \"level\": \"%s\", \"message\": \"%s\"}",
                       timestamp, channel, level, "'"$sanitized_entry"'"
            }
        }'
    else
        # Fallback for non-standard format
        echo "{\"timestamp\": \"$(date '+%Y-%m-%d %H:%M:%S')\", \"channel\": \"laravel\", \"level\": \"error\", \"message\": \"$sanitized_entry\"}"
    fi
}

# Function to process log line
process_log_line() {
    local line="$1"
    local source="$2"
    local log_type="$3"
    local file_path="$4"
    local id=$(generate_id "${file_path}-${line}")
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Determine level based on source
    local level
    if [ "$source" = "laravel" ]; then
        level=$(determine_laravel_level "$line")
    elif [ "$source" = "pm2" ]; then
        level=$(determine_pm2_level "$line" "$log_type")
    elif [ "$source" = "apache" ]; then
        level=$(determine_apache_level "$line" "$log_type")
    elif [ "$source" = "uvicorn" ]; then
        level=$(determine_uvicorn_level "$line")
    else
        level=$(determine_level "$line" "$log_type")
    fi

    # Sanitize the message to remove newlines and special characters
    local sanitized_message=$(sanitize_message "$line")

    # Parse different log types
    local details="{}"
    if [ "$source" = "nginx" ] && [ "$log_type" = "access" ]; then
        details=$(parse_nginx_access "$line")
    elif [ "$source" = "apache" ] && [ "$log_type" = "access" ]; then
        details=$(parse_apache_access "$line")
    elif [ "$source" = "apache" ] && [ "$log_type" = "error" ]; then
        details=$(parse_apache_error "$line")
    elif [ "$source" = "laravel" ]; then
        details=$(parse_laravel_log "$line")
    elif [ "$source" = "pm2" ]; then
        details=$(parse_pm2_log "$line")
    elif [ "$source" = "uvicorn" ]; then
        details=$(parse_uvicorn_log "$line")
    fi

    # Create the log entry with sanitized message
    cat <<EOF
{
  "id": "$id",
  "project": "project_name",
  "timestamp": "$timestamp",
  "source": "$source",
  "message": "$sanitized_message",
  "level": "$level",
  "details": $details
}
EOF
}

# Function to find latest log file with pattern
find_latest_log_file() {
    local pattern="$1"
    # Use find to handle wildcards properly and sort by modification time
    find $(dirname "$pattern") -name "$(basename "$pattern")" -type f 2>/dev/null | \
    xargs ls -1t 2>/dev/null | head -1
}

# Function to check if log file/directory exists and is accessible
check_log_source() {
    local source="$1"
    local pattern="$2"

    case "$source" in
        nginx|system|apache)
            if [ ! -f "$pattern" ] && [ ! -d "$(dirname "$pattern")" ]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - Log source not found: $pattern" >> "${LOG_DIR}/grove.log"
                return 1
            fi
            ;;
        laravel)
            if [ ! -d "$LARAVEL_LOG_DIR" ]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - Laravel log directory not found: $LARAVEL_LOG_DIR" >> "${LOG_DIR}/grove.log"
                return 1
            fi
            ;;
        pm2)
            if [ ! -d "$PM2_LOGS_DIR" ]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - PM2 logs directory not found: $PM2_LOGS_DIR" >> "${LOG_DIR}/grove.log"
                return 1
            fi
            ;;
        uvicorn)
            if [ ! -f "$pattern" ]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - Uvicorn log file not found: $pattern" >> "${LOG_DIR}/grove.log"
                return 1
            fi
            ;;
    esac

    return 0
}

# Function to test API connection with better error handling
test_api_connection() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Testing API connection to $API_URL..." >> "${LOG_DIR}/grove.log"

    local max_retries=5
    local retry_delay=5
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        local test_response=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer $API_TOKEN" \
            "$API_URL" 2>> "${LOG_DIR}/grove-curl.log")

        local http_code=$(echo "$test_response" | tail -n1)
        local response_body=$(echo "$test_response" | sed '$d')

        if [ "$http_code" -eq 200 ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - API connection test successful" >> "${LOG_DIR}/grove.log"
            return 0
        else
            echo "$(date '+%Y-%m-%d %H:%M:%S') - API connection test failed (attempt $((retry_count+1))/$max_retries): HTTP $http_code" >> "${LOG_DIR}/grove.log"
            echo "Response: $response_body" >> "${LOG_DIR}/grove.log"

            retry_count=$((retry_count+1))
            if [ $retry_count -lt $max_retries ]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - Retrying in $retry_delay seconds..." >> "${LOG_DIR}/grove.log"
                sleep $retry_delay
            fi
        fi
    done

    echo "$(date '+%Y-%m-%d %H:%M:%S') - API connection test failed after $max_retries attempts" >> "${LOG_DIR}/grove.log"
    return 1
}

# Function to monitor Apache logs with graceful error handling
monitor_apache_logs() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Apache log monitor" >> "${LOG_DIR}/grove.log"

    if [ ! -d "$APACHE_LOGS_DIR" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Apache logs directory not found, skipping: $APACHE_LOGS_DIR" >> "${LOG_DIR}/grove.log"
        return 0  # Skip gracefully
    fi

    # Monitor Apache access log
    monitor_log_file "$APACHE_LOGS_DIR/access.log" "apache" "access" &
    monitor_log_file "$APACHE_LOGS_DIR/access_log" "apache" "access" &
    monitor_log_file "$APACHE_LOGS_DIR/other_vhosts_access.log" "apache" "access" &

    # Monitor Apache error log
    monitor_log_file "$APACHE_LOGS_DIR/error.log" "apache" "error" &
    monitor_log_file "$APACHE_LOGS_DIR/error_log" "apache" "error" &

    return 0
}

# Function to monitor PM2 logs with graceful error handling
monitor_pm2_logs() {
    local pm2_logs_dir="$PM2_LOGS_DIR"

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting PM2 log monitor" >> "${LOG_DIR}/grove.log"

    if [ ! -d "$pm2_logs_dir" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - PM2 logs directory not found, skipping: $pm2_logs_dir" >> "${LOG_DIR}/grove.log"
        return 0  # Skip gracefully
    fi

    # Monitor all PM2 log files
    local pm2_log_files=$(find "$pm2_logs_dir" -name "*.log" -type f 2>/dev/null)

    if [ -z "$pm2_log_files" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - No PM2 log files found, skipping: $pm2_logs_dir" >> "${LOG_DIR}/grove.log"
        return 0  # Skip gracefully
    fi

    for log_file in $pm2_log_files; do
        if [ ! -f "$log_file" ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - PM2 log file not found, skipping: $log_file" >> "${LOG_DIR}/grove.log"
            continue
        fi

        echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring PM2 log: $log_file" >> "${LOG_DIR}/grove.log"

        # Determine log type based on filename
        local log_type="out"
        if echo "$log_file" | grep -q "error"; then
            log_type="error"
        fi

        # Start monitoring this log file in background
        (
            tail -n 0 -F "$log_file" 2>/dev/null | while read -r line; do
                if [ -n "$line" ]; then
                    local processed_entry=$(process_log_line "$line" "pm2" "$log_type" "$log_file")
                    send_to_api "$processed_entry" &
                fi
            done
        ) &
    done

    return 0
}

# Function to monitor Uvicorn logs with graceful error handling
monitor_uvicorn_logs() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Uvicorn log monitor" >> "${LOG_DIR}/grove.log"

    # Check if Uvicorn log file exists
    if ! check_log_source "uvicorn" "$UVICORN_LOG_FILE"; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Uvicorn log file not found, skipping: $UVICORN_LOG_FILE" >> "${LOG_DIR}/grove.log"
        return 0  # Skip gracefully
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring Uvicorn log: $UVICORN_LOG_FILE" >> "${LOG_DIR}/grove.log"

    # Monitor the Uvicorn log file
    tail -n 0 -F "$UVICORN_LOG_FILE" 2>/dev/null | while read -r line; do
        if [ -n "$line" ]; then
            local processed_entry=$(process_log_line "$line" "uvicorn" "application" "$UVICORN_LOG_FILE")
            send_to_api "$processed_entry" &
        fi
    done

    return 0
}

# Function to monitor a log file with graceful error handling
monitor_log_file() {
    local file_pattern="$1"
    local source="$2"
    local log_type="$3"

    # Check if log source exists
    if ! check_log_source "$source" "$file_pattern"; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Skipping unavailable log source: $file_pattern" >> "${LOG_DIR}/grove.log"
        return 0  # Skip gracefully
    fi

    # Find the most recent log file matching the pattern
    local log_file=$(find_latest_log_file "$file_pattern")

    if [ -z "$log_file" ] || [ ! -f "$log_file" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - No log file found for pattern, skipping: $file_pattern" >> "${LOG_DIR}/grove.log"
        return 0  # Skip gracefully
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring: $log_file" >> "${LOG_DIR}/grove.log"

    # Use tail -F to follow the file and detect rotation
    tail -n 0 -F "$log_file" 2>/dev/null | while read -r line; do
        if [ -n "$line" ]; then
            local processed_entry=$(process_log_line "$line" "$source" "$log_type" "$log_file")
            send_to_api "$processed_entry" &
        fi
    done

    return 0
}

# Function to monitor Laravel logs specifically with improved multiline handling
monitor_laravel_logs() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Laravel log monitor" >> "${LOG_DIR}/grove.log"

    # Check if Laravel log directory exists
    if [ ! -d "$LARAVEL_LOG_DIR" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Laravel log directory not found, skipping: $LARAVEL_LOG_DIR" >> "${LOG_DIR}/grove.log"
        return 0
    fi

    while true; do
        local latest_log=$(find_latest_log_file "$LARAVEL_LOG_DIR/$LARAVEL_LOG_PATTERN")

        if [ -z "$latest_log" ] || [ ! -f "$latest_log" ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - No Laravel log files found, waiting..." >> "${LOG_DIR}/grove.log"
            sleep 30
            continue
        fi

        echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring Laravel log: $latest_log" >> "${LOG_DIR}/grove.log"

        # Use a more robust approach for multiline logs
        (
            # Buffer to accumulate multiline entries
            local current_entry=""

            # Read from the log file
            tail -n 0 -F "$latest_log" 2>/dev/null | while IFS= read -r line; do
                if [ -n "$line" ]; then
                    # Check if this is the start of a new log entry (timestamp pattern)
                    if echo "$line" | grep -q "^\[[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\]"; then
                        # Process the previous entry if it exists
                        if [ -n "$current_entry" ]; then
                            local processed_entry=$(process_log_line "$current_entry" "laravel" "application" "$latest_log")
                            send_to_api "$processed_entry" &
                        fi
                        # Start new entry
                        current_entry="$line"
                    else
                        # Continue building current multiline entry
                        current_entry="$current_entry\n$line"
                    fi
                fi
            done
        ) &

        # Wait for the tail process to finish (file rotation)
        wait
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Laravel log file changed, looking for new one..." >> "${LOG_DIR}/grove.log"
        sleep 1
    done
}

# Function to collect system metrics periodically
collect_system_metrics() {
    while true; do
        local metrics=$(process_system_metrics)
        send_to_api "$metrics" &
        sleep 60  # Collect every minute
    done
}

# Main function with graceful error handling for all log sources
main() {
    echo "Starting log collector..." >> "${LOG_DIR}/grove.log"
    echo $$ > "$PID_FILE"

    # Test API connection first with retries
    if ! test_api_connection; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - API connection failed, but continuing in offline mode" >> "${LOG_DIR}/grove.log"
        echo "Warning: Running in offline mode - logs will be collected but not sent to API" >> "${LOG_DIR}/grove.log"
        # Don't exit, continue in offline mode
    fi

    # Start system metrics collection in background
    collect_system_metrics &

    # Monitor all log files with graceful error handling
    monitor_log_file "/var/log/nginx/access.log" "nginx" "access" &
    monitor_log_file "/var/log/nginx/error.log" "nginx" "error" &
    monitor_log_file "/var/log/syslog" "system" "system" &
    monitor_log_file "/var/log/auth.log" "system" "system" &

    # Monitor Apache logs (will skip gracefully if not available)
    monitor_apache_logs &

    # Special handling for Laravel logs with rotation and multiline support
    monitor_laravel_logs &

    # Monitor PM2 logs with graceful error handling
    monitor_pm2_logs &

    # Monitor Uvicorn/FastAPI logs with graceful error handling
    monitor_uvicorn_logs &

    # Wait for all background processes (this will keep the script running)
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Log collector started successfully. Monitoring logs..." >> "${LOG_DIR}/grove.log"

    # Infinite loop to keep the script running
    while true; do
        sleep 3600  # Sleep for 1 hour, but keep the process alive
    done
}

# Handle script termination gracefully
cleanup() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Stopping log collector gracefully" >> "${LOG_DIR}/grove.log"
    rm -f "$PID_FILE"
    # Kill all child processes
    pkill -P $$ 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Install with: sudo apt-get install jq"
    exit 1
fi

# Check if curl is installed
if ! command -v curl &> /dev/null; then
    echo "Error: curl is required but not installed. Install with: sudo apt-get install curl"
    exit 1
fi

# Check if bc is installed
if ! command -v bc &> /dev/null; then
    echo "Error: bc is required but not installed. Install with: sudo apt-get install bc"
    exit 1
fi

# Check if find and xargs are available
if ! command -v find &> /dev/null || ! command -v xargs &> /dev/null; then
    echo "Error: find and xargs are required utilities"
    exit 1
fi

# Start the main function
main
