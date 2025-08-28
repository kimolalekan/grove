I'll guide you through installing Meilisearch on Ubuntu. Here are several methods:

## Method 1: Using the Installation Script (Recommended)

### Step 1: Download and run the installation script
```bash
curl -L https://install.meilisearch.com | sh
```

### Step 2: Move the binary to your PATH
```bash
sudo mv ./meilisearch /usr/bin/
```

### Step 3: Verify installation
```bash
meilisearch --version
```

## Method 2: Using APT Package Manager

### Step 1: Add Meilisearch repository
```bash
echo "deb [trusted=yes] https://apt.fury.io/meilisearch/ /" | sudo tee /etc/apt/sources.list.d/fury.list
```

### Step 2: Update package list and install
```bash
sudo apt update
sudo apt install meilisearch-http
```

## Method 3: Using Docker

### Step 1: Install Docker (if not already installed)
```bash
sudo apt update
sudo apt install docker.io
sudo systemctl enable --now docker
```

### Step 2: Run Meilisearch container
```bash
sudo docker run -d \
  -p 7700:7700 \
  -v $(pwd)/data.ms:/data.ms \
  getmeili/meilisearch:latest
```

## Starting Meilisearch

### Basic startup (for development)
```bash
meilisearch --master-key=MASTER_KEY
```

### Production setup with environment variables
```bash
export MEILI_MASTER_KEY=your_master_key_here
export MEILI_ENV=production
meilisearch
```

### Or use command line arguments
```bash
meilisearch --master-key=your_master_key --env=production
```

## Setting up as a System Service

### Create service file
```bash
sudo nano /etc/systemd/system/meilisearch.service
```

### Add the following content:
```ini
[Unit]
Description=Meilisearch
After=systemd-user-sessions.service

[Service]
Type=simple
ExecStart=/usr/bin/meilisearch --env production --master-key YOUR_MASTER_KEY
Restart=always

[Install]
WantedBy=multi-user.target
```

### Enable and start the service
```bash
sudo systemctl daemon-reload
sudo systemctl enable meilisearch
sudo systemctl start meilisearch
sudo systemctl status meilisearch
```

## Testing the Installation

### Check if Meilisearch is running
```bash
curl http://localhost:7700/version
```

### Or access via browser
Open `http://localhost:7700` in your web browser

## Configuration

### Create a config file (optional)
```bash
mkdir -p /etc/meilisearch
sudo nano /etc/meilisearch/config.toml
```

### Example config:
```toml
env = "production"
master_key = "your-secret-master-key"
db_path = "/var/lib/meilisearch/data.ms"
http_addr = "127.0.0.1:7700"
```

## Security Considerations

1. **Always set a master key** in production
2. **Use environment variables** for sensitive data
3. **Consider firewall rules** to restrict access
4. **Use HTTPS** in production (via reverse proxy)

## Useful Commands

```bash
# Check status
sudo systemctl status meilisearch

# View logs
journalctl -u meilisearch -f

# Stop service
sudo systemctl stop meilisearch

# Restart service
sudo systemctl restart meilisearch
```

The installation script method (Method 1) is usually the simplest for most users. Choose the method that best fits your needs!
