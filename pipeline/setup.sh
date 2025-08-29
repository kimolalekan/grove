# Setup metric for grove observer
sudo mkdir -p /var/log/grove
sudo touch /var/log/grove.log
sudo chmod 644 /var/log/grove.log

# Create the directory
sudo mkdir -p /etc/grove

# Create the script file
sudo touch /etc/grove/system-metrics.sh
sudo touch /etc/grove/grove.sh
