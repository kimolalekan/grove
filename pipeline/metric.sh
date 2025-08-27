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
