# Setup metric for grove observer
sudo apt-get install jq
sudo apt-get install curl

sudo touch /var/log/grove.log
sudo chmod 644 /var/log/grove.log

# Create the directory
sudo mkdir -p /etc/grove

# Create the script file
sudo touch /etc/grove/grove.sh
chmod +x /etc/grove/grove.sh


# Create the service file path and content
SERVICE_FILE="/etc/systemd/system/grove.service"
SERVICE_CONTENT="[Unit]
Description=Grove Collector Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/etc/grove/grove.sh
Restart=always
RestartSec=5
StandardOutput=append:/var/log/grove.log
StandardError=append:/var/log/grove.log

[Install]
WantedBy=multi-user.target"

# Create the service file
echo "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" > /dev/null

# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable grove.service

# Start the service immediately
sudo systemctl start grove.service

# Check the status of the service
sudo systemctl status grove.service
