# Deployment & Setup Guide

## 1. Oracle Autonomous Database Setup
1. Log in to **Oracle Cloud Console**.
2. Go to **Oracle Database** -> **Autonomous Database**.
3. Create a new "Always Free" instance.
4. Download the **Client Credentials (Wallet)**.
5. In the backend `.env` file, set:
   - `ORACLE_USER=ADMIN`
   - `ORACLE_PASSWORD=YourStrongPassword`
   - `ORACLE_DSN=your_db_high`

## 2. Backend Deployment (Oracle Cloud VM)
1. Provision an **Ampere A1** or **AMD Compute Instance**.
2. Clone the repository and install dependencies:
   ```bash
   sudo apt update
   sudo apt install python3-pip python3-venv libaio1 -y
   python3 -m venv venv
   source venv/bin/activate
   pip install -r backend/requirements.txt
   ```
3. Set up **systemd** service for the backend:
   Create `/etc/systemd/system/inventory.service`:
   ```ini
   [Unit]
   Description=Inventory Pro API
   After=network.target

   [Service]
   User=ubuntu
   WorkingDirectory=/home/ubuntu/inventory-pro/backend
   ExecStart=/home/ubuntu/inventory-pro/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
4. Start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start inventory
   sudo systemctl enable inventory
   ```

## 3. Frontend & NGINX
1. Install NGINX: `sudo apt install nginx -y`
2. Copy frontend files to `/var/www/inventory`.
3. Configure NGINX `/etc/nginx/sites-available/inventory`:
   ```nginx
   server {
       listen 80;
       server_name your_domain_or_ip;

       location / {
           root /var/www/inventory;
           index index.html;
           try_files $uri $uri/ /index.html;
       }

       location /api {
           proxy_pass http://localhost:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
4. Enable and restart NGINX:
   ```bash
   sudo ln -s /etc/nginx/sites-available/inventory /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```

## 4. HTTPS (Optional)
Use `certbot` for free SSL:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx
```
