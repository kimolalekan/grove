#!/bin/bash
# System metrics collection script

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOSTNAME=$(hostname)

# CPU Usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
CPU_CORES=$(nproc)

# Memory Usage
MEM_TOTAL=$(free -b | grep Mem | awk '{print $2}')
MEM_USED=$(free -b | grep Mem | awk '{print $3}')
MEM_FREE=$(free -b | grep Mem | awk '{print $4}')
MEM_AVAILABLE=$(free -b | grep Mem | awk '{print $7}')
MEM_PERCENT=$(echo "scale=2; $MEM_USED / $MEM_TOTAL * 100" | bc)

# Disk Usage
DISK_INFO=$(df -B1 --output=source,target,size,used,avail,pcent | grep -E '^/dev/' | grep -v tmpfs | head -1)
DISK_TOTAL=$(echo $DISK_INFO | awk '{print $3}')
DISK_USED=$(echo $DISK_INFO | awk '{print $4}')
DISK_AVAILABLE=$(echo $DISK_INFO | awk '{print $5}')
DISK_PERCENT=$(echo $DISK_INFO | awk '{print $6}' | tr -d '%')
MOUNT_POINT=$(echo $DISK_INFO | awk '{print $2}')

# Create JSON output
cat << EOF
{
  "timestamp": "$TIMESTAMP",
  "host": "$HOSTNAME",
  "cpu": {
    "usage_percent": $CPU_USAGE,
    "cores": $CPU_CORES
  },
  "memory": {
    "total_bytes": $MEM_TOTAL,
    "used_bytes": $MEM_USED,
    "free_bytes": $MEM_FREE,
    "available_bytes": $MEM_AVAILABLE,
    "usage_percent": $MEM_PERCENT
  },
  "disk": {
    "total_bytes": $DISK_TOTAL,
    "used_bytes": $DISK_USED,
    "available_bytes": $DISK_AVAILABLE,
    "usage_percent": $DISK_PERCENT,
    "mount_point": "$MOUNT_POINT"
  }
}
EOF
