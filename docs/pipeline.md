## Setup log pipeline using Filebeat and custom metrics collection

```yaml
filebeat.inputs:
  # Nginx Access Logs
  - type: filestream
    enabled: true
    id: nginx-access
    paths:
      - /var/log/nginx/access.log
    fields:
      source: "nginx"
      log_type: "access"
    fields_under_root: true
    parsers:
      - ndjson: {}

  # Nginx Error Logs
  - type: filestream
    enabled: true
    id: nginx-error
    paths:
      - /var/log/nginx/error.log
    fields:
      source: "nginx"
      log_type: "error"
    fields_under_root: true

  # Apache Access Logs
  - type: filestream
    enabled: true
    id: apache-access
    paths:
      - /var/log/apache2/access.log
      - /var/log/apache2/other_vhosts_access.log
    fields:
      source: "apache"
      log_type: "access"
    fields_under_root: true

  # Apache Error Logs
  - type: filestream
    enabled: true
    id: apache-error
    paths:
      - /var/log/apache2/error.log
    fields:
      source: "apache"
      log_type: "error"
    fields_under_root: true

  # Application Logs (adjust paths as needed)
  - type: filestream
    enabled: true
    id: app-logs
    paths:
      - /var/log/myapp/*.log
      - /opt/myapp/logs/*.log
      - /home/*/app/logs/*.log
    fields:
      source: "application"
      log_type: "application"
    fields_under_root: true
    multiline:
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}"
      negate: true
      match: after

  # Optional: System logs
  - type: filestream
    enabled: false # Enable if you want system logs
    id: syslogs
    paths:
      - /var/log/syslog
      - /var/log/auth.log
    fields:
      source: "system"
      log_type: "system"
    fields_under_root: true

  # System Metrics Logs
  - type: log
    enabled: true
    id: system-metrics
    paths:
      - /var/log/system-metrics.log
    fields:
      source: "system-metrics"
      log_type: "metrics"
    fields_under_root: true
    json:
      keys_under_root: true
      overwrite_keys: true

processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_cloud_metadata: ~
  - add_docker_metadata: ~
  - add_kubernetes_metadata: ~

  # Generate ID for logs
  - fingerprint:
      fields: ["log.file.path", "message"]
      target_field: "id"
      method: "sha256"
      encoding: "hex"
      when:
        not:
          equals:
            source: "system-metrics"

  # Generate ID for metrics (different fields to avoid conflicts)
  - fingerprint:
      fields: ["timestamp", "host.name"]
      target_field: "id"
      method: "sha1"
      encoding: "hex"
      when:
        equals:
            source: "system-metrics"

  # Set log level based on source and content (for logs)
  - script:
      lang: javascript
      source: >
        function process(event) {
          var source = event.Get("source");

          // Handle metrics differently
          if (source === "system-metrics") {
            var level = "info";
            var cpuUsage = event.Get("cpu.usage_percent");
            var memUsage = event.Get("memory.usage_percent");
            var diskUsage = event.Get("disk.usage_percent");

            if (cpuUsage > 80 || memUsage > 80 || diskUsage > 90) {
              level = "warning";
            }
            if (diskUsage > 95) {
              level = "error";
            }
            event.Put("level", level);

            // Create meaningful message for metrics
            var message = "System Metrics - ";
            message += "CPU: " + Math.round(cpuUsage) + "%, ";
            message += "Memory: " + Math.round(memUsage) + "%, ";
            message += "Disk: " + Math.round(diskUsage) + "%";
            event.Put("message", message);

          } else {
            // Handle regular logs
            var message = event.Get("message");
            var logType = event.Get("log_type");
            var level = "info";

            if (logType === "error") {
              level = "error";
            } else if (message && message.toLowerCase().includes("warn")) {
              level = "warning";
            } else if (message && (
              message.toLowerCase().includes("error") ||
              message.toLowerCase().includes("failed") ||
              message.toLowerCase().includes("exception")
            )) {
              level = "error";
            }
            event.Put("level", level);
          }
        }

  # Extract details from HTTP logs (only for web logs)
  - dissect:
      tokenizer: '%{client.ip} - %{?user.id} [%{@timestamp}] "%{http.request.method} %{url.original} HTTP/%{http.version}" %{http.response.status_code} %{http.response.body.bytes} "%{http.request.referrer}" "%{user_agent.original}"'
      field: "message"
      target_prefix: "temp"
      ignore_failure: true
      when:
        or:
          - equals:
              source: "nginx"
          - equals:
              source: "apache"

  # Rename fields to match your LogEntry format (for web logs)
  - rename:
      fields:
        - from: "temp.client.ip"
          to: "details.ip"
        - from: "temp.user_agent.original"
          to: "details.userAgent"
        - from: "temp.user.id"
          to: "details.userId"
        - from: "temp.http.response.status_code"
          to: "details.statusCode"
        - from: "temp.http.request.method"
          to: "details.method"
        - from: "temp.url.original"
          to: "details.path"
        - from: "temp.http.response.body.bytes"
          to: "details.size"
      ignore_missing: true
      fail_on_error: false
      when:
        or:
          - equals:
              source: "nginx"
          - equals:
              source: "apache"

  # Convert timestamp for all events
  - convert:
      fields:
        - from: "@timestamp"
          to: "timestamp"
          type: "string"
          mode: "rename"
      ignore_missing: true

  # Remove unnecessary fields
  - drop_fields:
      fields: ["ecs", "agent", "input", "log", "host", "temp"]
      ignore_missing: true

output.http:
  hosts: ["http://your-custom-endpoint.com/api/logs"] # Your endpoint URL
  protocol: "https"
  method: "POST"
  headers:
    Content-Type: "application/json"
    Authorization: "Bearer your-auth-token" # If needed
  message_format: "formatted"
  format:
    string: |
      {{if eq .source "system-metrics"}}
      {
        "id": "{{.id}}",
        "timestamp": "{{.timestamp}}",
        "source": "system-metrics",
        "message": "{{.message}}",
        "level": "{{.level}}",
        "details": {
          "host": "{{.host.name}}",
          "cpu_usage": {{.cpu.usage_percent}},
          "cpu_cores": {{.cpu.cores}},
          "memory_total": {{.memory.total_bytes}},
          "memory_used": {{.memory.used_bytes}},
          "memory_free": {{.memory.free_bytes}},
          "memory_available": {{.memory.available_bytes}},
          "memory_usage": {{.memory.usage_percent}},
          "disk_total": {{.disk.total_bytes}},
          "disk_used": {{.disk.used_bytes}},
          "disk_available": {{.disk.available_bytes}},
          "disk_usage": {{.disk.usage_percent}},
          "mount_point": "{{.disk.mount_point}}"
        }
      }
      {{else}}
      {
        "id": "{{.id}}",
        "project": "ProjectName",
        "timestamp": "{{.timestamp}}",
        "source": "{{.source}}",
        "message": "{{.message}}",
        "level": "{{.level}}",
        "details": {
        {{if .details.ip}}"ip": "{{.details.ip}}",{{end}}
        {{if .details.userAgent}}"userAgent": "{{.details.userAgent}}",{{end}}
        {{if .details.userId}}"userId": "{{.details.userId}}",{{end}}
        {{if .details.duration}}"duration": {{.details.duration}},{{end}}
        {{if .details.statusCode}}"statusCode": {{.details.statusCode}},{{end}}
        {{if .details.method}}"method": "{{.details.method}}",{{end}}
        {{if .details.path}}"path": "{{.details.path}}",{{end}}
        {{if .details.size}}"size": "{{.details.size}}"{{end}}
        }
      }
      {{end}}

# Enable logging for debugging
logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0644
```

**Key changes made:**

1. **Added metrics input**: Integrated the system metrics input with a unique `id: system-metrics`

2. **Conditional processing**: Used `when` conditions to apply different processing based on the source:
   - Different fingerprint methods for logs vs metrics
   - Different JavaScript logic for setting levels and messages
   - HTTP log parsing only for nginx/apache sources

3. **Unified output**: Used conditional formatting in the output template to handle both log and metric formats

4. **Consistent field handling**: Made sure timestamp conversion and field dropping apply to all events

**Additional setup needed:**

1. **Create the metrics collector script** (`/opt/metrics-collector/system-metrics.sh`):
```bash
#!/bin/bash
#!/bin/bash

# Get CPU usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')

# Get memory info
MEM_TOTAL=$(free -b | grep Mem | awk '{print $2}')
MEM_USED=$(free -b | grep Mem | awk '{print $3}')
MEM_FREE=$(free -b | grep Mem | awk '{print $4}')
MEM_AVAILABLE=$(free -b | grep Mem | awk '{print $7}')
MEM_USAGE_PERCENT=$(echo "scale=2; $MEM_USED/$MEM_TOTAL*100" | bc)

# Get disk info for root partition
DISK_INFO=$(df -B1 / | tail -1)
DISK_TOTAL=$(echo $DISK_INFO | awk '{print $2}')
DISK_USED=$(echo $DISK_INFO | awk '{print $3}')
DISK_AVAILABLE=$(echo $DISK_INFO | awk '{print $4}')
DISK_USAGE_PERCENT=$(echo "scale=2; $DISK_USED/$DISK_TOTAL*100" | bc)
MOUNT_POINT=$(echo $DISK_INFO | awk '{print $6}')

# Get CPU cores
CPU_CORES=$(nproc)

# Create JSON output
echo "{
  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
  \"cpu\": {
    \"usage_percent\": $CPU_USAGE,
    \"cores\": $CPU_CORES
  },
  \"memory\": {
    \"total_bytes\": $MEM_TOTAL,
    \"used_bytes\": $MEM_USED,
    \"free_bytes\": $MEM_FREE,
    \"available_bytes\": $MEM_AVAILABLE,
    \"usage_percent\": $MEM_USAGE_PERCENT
  },
  \"disk\": {
    \"total_bytes\": $DISK_TOTAL,
    \"used_bytes\": $DISK_USED,
    \"available_bytes\": $DISK_AVAILABLE,
    \"usage_percent\": $DISK_USAGE_PERCENT,
    \"mount_point\": \"$MOUNT_POINT\"
  },
  \"host\": {
    \"name\": \"$(hostname)\"
  }
}"
```

2. **Make it executable**:
```bash
chmod +x /opt/metrics-collector/system-metrics.sh
```

3. **Add to crontab** (run every 10 seconds):
```bash
* * * * * for i in {0..5}; do /opt/metrics-collector/system-metrics.sh >> /var/log/system-metrics.log; sleep 10; done
```
