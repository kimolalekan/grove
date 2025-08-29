#!/bin/bash
set -euo pipefail

# Configuration
API_URL="https://logs.arya.market/api/logs"
API_TOKEN="your-auth-token"
LOG_DIR="/var/log"
CONFIG_DIR="/opt/metrics-collector"
PID_FILE="/var/run/collector.pid"
MAX_RETRIES=3
RETRY_DELAY=2

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

# Function to send log to API
send_to_api() {
    local log_data="$1"
    local retry_count=0
    local http_code

    while [ $retry_count -lt $MAX_RETRIES ]; do
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $API_TOKEN" \
            -d "$log_data" \
            "$API_URL")

        if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Log sent successfully" >> "${LOG_DIR}/collector.log"
            return 0
        else
            echo "$(date '+%Y-%m-%d %H:%M:%S') - API call failed (attempt $((retry_count+1))/$MAX_RETRIES): HTTP $http_code" >> "${LOG_DIR}/error.log"
            retry_count=$((retry_count+1))
            sleep $RETRY_DELAY
        fi
    done

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Failed to send log after $MAX_RETRIES attempts" >> "${LOG_DIR}/error.log"
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

# Function to determine log level
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

# Function to process system metrics
process_system_metrics() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local mem_info=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local disk_usage=$(df / | awk 'NR==2{print $5}' | cut -d'%' -f1)
    local hostname=$(hostname)

    local level="info"
    if [ $(echo "$disk_usage > 90" | bc -l) -eq 1 ]; then
        level="error"
    elif [ $(echo "$cpu_usage > 80" | bc -l) -eq 1 ] || [ $(echo "$mem_info > 80" | bc -l) -eq 1 ]; then
        level="warning"
    fi

    local message="System Metrics - CPU: ${cpu_usage}%, Memory: ${mem_info}%, Disk: ${disk_usage}%"
    local id=$(generate_id "${hostname}-$(date +%s)")

    cat <<EOF
{
  "id": "$id",
  "project": "ProjectName",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "source": "system_metrics",
  "message": "$message",
  "level": "$level",
  "details": {
    "host": "$hostname",
    "cpu_usage": $cpu_usage,
    "memory_usage": $mem_info,
    "disk_usage": $disk_usage
  }
}
EOF
}

# Function to process log line
process_log_line() {
    local line="$1"
    local source="$2"
    local log_type="$3"
    local file_path="$4"

    local id=$(generate_id "${file_path}-${line}")
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local level=$(determine_level "$line" "$log_type")

    # Parse different log types
    local details="{}"
    if [ "$source" = "nginx" ] && [ "$log_type" = "access" ]; then
        details=$(parse_nginx_access "$line")
    fi

    # Create the log entry
    cat <<EOF
{
  "id": "$id",
  "project": "ProjectName",
  "timestamp": "$timestamp",
  "source": "$source",
  "message": "$(echo "$line" | jq -R -s -c . | sed 's/^"//;s/"$//')",
  "level": "$level",
  "details": $details
}
EOF
}

# Function to monitor a log file
monitor_log_file() {
    local file_pattern="$1"
    local source="$2"
    local log_type="$3"

    # Find the most recent log file matching the pattern
    local log_file=$(ls -1t $file_pattern 2>/dev/null | head -1)

    if [ -z "$log_file" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - No log file found for pattern: $file_pattern" >> "${LOG_DIR}/error.log"
        return 1
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring: $log_file" >> "${LOG_DIR}/collector.log"

    # Use tail -F to follow the file and detect rotation
    tail -n 0 -F "$log_file" | while read -r line; do
        if [ -n "$line" ]; then
            local log_entry=$(process_log_line "$line" "$source" "$log_type" "$log_file")
            send_to_api "$log_entry" &
        fi
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

# Main function
main() {
    echo "Starting log collector..." >> "${LOG_DIR}/collector.log"
    echo $$ > "$PID_FILE"

    # Start system metrics collection in background
    collect_system_metrics &

    # Monitor all log files
    monitor_log_file "/var/log/nginx/access.log" "nginx" "access" &
    monitor_log_file "/var/log/nginx/error.log" "nginx" "error" &
    monitor_log_file "/var/www/arya/storage/logs/*.log" "laravel" "application" &
    monitor_log_file "/var/log/syslog" "system" "system" &
    monitor_log_file "/var/log/auth.log" "system" "system" &

    # Wait for all background processes
    wait
}

# Handle script termination
cleanup() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Stopping log collector" >> "${LOG_DIR}/collector.log"
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start the main function
main
