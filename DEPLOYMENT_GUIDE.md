# NCT Rental System - Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Environment Setup](#environment-setup)
4. [Database Setup](#database-setup)
5. [Backend Deployment](#backend-deployment)
6. [Frontend Deployment](#frontend-deployment)
7. [Docker Deployment](#docker-deployment)
8. [Kubernetes Deployment](#kubernetes-deployment)
9. [Cloud Platform Deployment](#cloud-platform-deployment)
10. [Configuration Guide](#configuration-guide)
11. [Security Best Practices](#security-best-practices)
12. [Performance Tuning](#performance-tuning)
13. [Monitoring Setup](#monitoring-setup)
14. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Java Development Kit (JDK)**: Version 17 or higher
- **Node.js**: Version 18.x or higher
- **npm or yarn**: Latest stable version
- **PostgreSQL**: Version 14 or higher
- **Redis**: Version 6.x or higher
- **Git**: For version control
- **Docker** (Optional): Version 20.x or higher
- **Kubernetes** (Optional): Version 1.24 or higher

### Optional Software

- **RabbitMQ**: Version 3.11 or higher (for message queuing)
- **Kafka**: Version 3.x (alternative to RabbitMQ)
- **Nginx**: For reverse proxy and load balancing
- **PM2**: For Node.js process management
- **Maven**: Version 3.8 or higher (for Java backend)

---

## System Requirements

### Minimum Requirements (Development)

- **CPU**: 2 cores
- **RAM**: 4 GB
- **Disk Space**: 20 GB
- **Operating System**: Linux (Ubuntu 20.04+), macOS (11+), Windows 10/11

### Recommended Requirements (Production)

- **CPU**: 8 cores
- **RAM**: 16 GB
- **Disk Space**: 100 GB SSD
- **Operating System**: Linux (Ubuntu 22.04 LTS recommended)
- **Network**: High-speed internet connection (100 Mbps+)

### High-Traffic Production Requirements

- **CPU**: 16+ cores
- **RAM**: 32+ GB
- **Disk Space**: 500+ GB SSD with RAID configuration
- **Load Balancer**: Nginx or cloud load balancer
- **Database**: Master-slave replication or clustering
- **Cache**: Redis cluster

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/nct-rental-system.git
cd nct-rental-system
```

### 2. Environment Variables

Create environment-specific configuration files:

#### Development (.env.development)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nct_rental_dev
DB_USERNAME=postgres
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=your-development-secret-key-minimum-512-bits-long

# Mail Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=noreply@nct-rental.com
MAIL_PASSWORD=your_email_password

# AWS Configuration (Optional)
AWS_ACCESS_KEY=your_access_key
AWS_SECRET_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=nct-rental-dev

# Payment Gateway (Test Mode)
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application
SPRING_PROFILE=development
SERVER_PORT=8080
CORS_ORIGINS=http://localhost:3000
API_BASE_URL=http://localhost:8080
```

#### Staging (.env.staging)

```bash
# Database Configuration
DB_HOST=staging-db.nct-rental.com
DB_PORT=5432
DB_NAME=nct_rental_staging
DB_USERNAME=nct_rental_user
DB_PASSWORD=your_secure_password_here

# Redis Configuration
REDIS_HOST=staging-redis.nct-rental.com
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_redis_password

# JWT Configuration
JWT_SECRET=your-staging-secret-key-minimum-512-bits-long-and-cryptographically-secure

# Mail Configuration
MAIL_HOST=smtp.sendgrid.net
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=your_sendgrid_api_key

# AWS Configuration
AWS_ACCESS_KEY=your_staging_access_key
AWS_SECRET_KEY=your_staging_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=nct-rental-staging

# Payment Gateway (Test Mode)
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application
SPRING_PROFILE=staging
SERVER_PORT=8080
CORS_ORIGINS=https://staging.nct-rental.com
API_BASE_URL=https://api-staging.nct-rental.com

# RabbitMQ
RABBITMQ_HOST=staging-rabbitmq.nct-rental.com
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=nct_rental
RABBITMQ_PASSWORD=your_rabbitmq_password

# Security
OAUTH2_ENABLED=false
IP_WHITELIST_ENABLED=false
```

#### Production (.env.production)

```bash
# Database Configuration
DB_HOST=prod-db-primary.nct-rental.com
DB_PORT=5432
DB_NAME=nct_rental_prod
DB_USERNAME=nct_rental_user
DB_PASSWORD=${DB_PASSWORD_FROM_SECRETS_MANAGER}

# Redis Configuration
REDIS_HOST=prod-redis-cluster.nct-rental.com
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD_FROM_SECRETS_MANAGER}
REDIS_SSL=true

# JWT Configuration
JWT_SECRET=${JWT_SECRET_FROM_SECRETS_MANAGER}

# Mail Configuration
MAIL_HOST=smtp.sendgrid.net
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=${SENDGRID_API_KEY_FROM_SECRETS_MANAGER}

# AWS Configuration
AWS_ACCESS_KEY=${AWS_ACCESS_KEY_FROM_SECRETS_MANAGER}
AWS_SECRET_KEY=${AWS_SECRET_KEY_FROM_SECRETS_MANAGER}
AWS_REGION=us-east-1
AWS_S3_BUCKET=nct-rental-production

# Payment Gateway (Live Mode)
STRIPE_ENABLED=true
STRIPE_PUBLIC_KEY=${STRIPE_PUBLIC_KEY_FROM_SECRETS_MANAGER}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY_FROM_SECRETS_MANAGER}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET_FROM_SECRETS_MANAGER}

# Application
SPRING_PROFILE=production
SERVER_PORT=8080
CORS_ORIGINS=https://nct-rental.com,https://www.nct-rental.com
API_BASE_URL=https://api.nct-rental.com

# RabbitMQ
RABBITMQ_HOST=prod-rabbitmq-cluster.nct-rental.com
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=nct_rental_prod
RABBITMQ_PASSWORD=${RABBITMQ_PASSWORD_FROM_SECRETS_MANAGER}
RABBITMQ_SSL=true

# Security
OAUTH2_ENABLED=true
OAUTH2_CLIENT_ID=${OAUTH2_CLIENT_ID}
OAUTH2_CLIENT_SECRET=${OAUTH2_CLIENT_SECRET}
IP_WHITELIST_ENABLED=true
IP_WHITELIST=203.0.113.0/24,198.51.100.0/24

# SSL
SSL_ENABLED=true
SSL_KEY_STORE=/etc/ssl/nct-rental.p12
SSL_KEY_STORE_PASSWORD=${SSL_PASSWORD_FROM_SECRETS_MANAGER}

# Monitoring
APM_ENABLED=true
APM_SERVER_URL=https://apm.nct-rental.com

# Backup
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=90
BACKUP_S3_BUCKET=nct-rental-backups

# Logging
LOG_FILE=/var/log/nct-rental/application.log
```

---

## Database Setup

### PostgreSQL Installation

#### Ubuntu/Debian

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Access PostgreSQL
sudo -u postgres psql
```

#### macOS (using Homebrew)

```bash
# Install PostgreSQL
brew install postgresql@14

# Start PostgreSQL
brew services start postgresql@14

# Access PostgreSQL
psql postgres
```

### Database Creation

```sql
-- Create database
CREATE DATABASE nct_rental_prod;

-- Create user
CREATE USER nct_rental_user WITH ENCRYPTED PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE nct_rental_prod TO nct_rental_user;

-- Connect to database
\c nct_rental_prod

-- Create schema
CREATE SCHEMA IF NOT EXISTS nct_rental;

-- Grant schema privileges
GRANT ALL ON SCHEMA nct_rental TO nct_rental_user;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### Database Migration

The application uses Flyway for database migrations. Migration scripts should be placed in `src/main/resources/db/migration/`.

#### Example Migration Script (V1__initial_schema.sql)

```sql
-- Create vehicles table
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL,
    daily_rate DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    driver_license VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bookings table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id),
    customer_id UUID REFERENCES customers(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_customers_email ON customers(email);
```

### Redis Installation

#### Ubuntu/Debian

```bash
# Install Redis
sudo apt install redis-server

# Configure Redis for production
sudo nano /etc/redis/redis.conf
# Set: bind 0.0.0.0
# Set: requirepass your_secure_redis_password
# Set: maxmemory 2gb
# Set: maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

#### macOS

```bash
# Install Redis
brew install redis

# Start Redis
brew services start redis
```

---

## Backend Deployment

### Build the Application

```bash
cd car-rental-backend-java

# Build with Maven
./mvnw clean package -DskipTests

# Or with Gradle
./gradlew clean build -x test
```

### Run the Application

#### Development

```bash
# Using Maven
./mvnw spring-boot:run -Dspring-boot.run.profiles=development

# Using Java
java -jar target/nct-rental-backend-3.2.0.jar --spring.profiles.active=development
```

#### Production

```bash
# Run with production profile
java -jar \
  -Xms2g -Xmx4g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -Dspring.profiles.active=production \
  -Dserver.port=8080 \
  target/nct-rental-backend-3.2.0.jar
```

### Deploy as Systemd Service

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/nct-rental-backend.service
```

Add the following content:

```ini
[Unit]
Description=NCT Rental Backend Service
After=syslog.target network.target postgresql.service redis.service

[Service]
User=nct-rental
Group=nct-rental
WorkingDirectory=/opt/nct-rental/backend
ExecStart=/usr/bin/java \
  -Xms2g -Xmx4g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -Dspring.profiles.active=production \
  -jar /opt/nct-rental/backend/nct-rental-backend-3.2.0.jar

SuccessExitStatus=143
StandardOutput=journal
StandardError=journal
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nct-rental-backend
sudo systemctl start nct-rental-backend

# Check status
sudo systemctl status nct-rental-backend

# View logs
sudo journalctl -u nct-rental-backend -f
```

---

## Frontend Deployment

### Build the Frontend

```bash
cd car-rental-frontend

# Install dependencies
npm install
# or
yarn install

# Build for production
npm run build
# or
yarn build
```

### Deploy with Nginx

#### Install Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx

# macOS
brew install nginx
```

#### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/nct-rental
```

Add the following configuration:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name nct-rental.com www.nct-rental.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nct-rental.com www.nct-rental.com;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/nct-rental.crt;
    ssl_certificate_key /etc/ssl/private/nct-rental.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root directory
    root /var/www/nct-rental/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://localhost:8080/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/nct-rental /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Deploy with PM2 (Alternative for Next.js)

If using Next.js:

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start npm --name "nct-rental-frontend" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

---

## Docker Deployment

### Dockerfile for Backend

Create `Dockerfile` in the backend directory:

```dockerfile
# Build stage
FROM maven:3.8-openjdk-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

# Runtime stage
FROM openjdk:17-jdk-slim
WORKDIR /app

# Install utilities
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy JAR from build stage
COPY --from=build /app/target/nct-rental-backend-*.jar app.jar

# Create non-root user
RUN useradd -m -u 1001 nct-rental && chown -R nct-rental:nct-rental /app
USER nct-rental

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

# Expose port
EXPOSE 8080

# Run application
ENTRYPOINT ["java", "-Xms2g", "-Xmx4g", "-XX:+UseG1GC", "-jar", "app.jar"]
```

### Dockerfile for Frontend

Create `Dockerfile` in the frontend directory:

```dockerfile
# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    container_name: nct-rental-postgres
    environment:
      POSTGRES_DB: nct_rental_prod
      POSTGRES_USER: nct_rental_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - nct-rental-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nct_rental_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: nct-rental-redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - nct-rental-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ./car-rental-backend-java
      dockerfile: Dockerfile
    container_name: nct-rental-backend
    environment:
      SPRING_PROFILES_ACTIVE: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: nct_rental_prod
      DB_USERNAME: nct_rental_user
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - nct-rental-network
    restart: unless-stopped

  frontend:
    build:
      context: ./car-rental-frontend
      dockerfile: Dockerfile
    container_name: nct-rental-frontend
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    networks:
      - nct-rental-network
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  nct-rental-network:
    driver: bridge
```

### Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (EKS, GKE, AKS, or self-managed)
- kubectl configured
- Helm (optional)

### Kubernetes Manifests

#### Namespace

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nct-rental
```

#### ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nct-rental-config
  namespace: nct-rental
data:
  SPRING_PROFILES_ACTIVE: "production"
  DB_HOST: "postgres-service"
  DB_PORT: "5432"
  DB_NAME: "nct_rental_prod"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  SERVER_PORT: "8080"
```

#### Secrets

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: nct-rental-secrets
  namespace: nct-rental
type: Opaque
stringData:
  DB_PASSWORD: "your_secure_password"
  REDIS_PASSWORD: "your_redis_password"
  JWT_SECRET: "your_jwt_secret"
  AWS_ACCESS_KEY: "your_aws_access_key"
  AWS_SECRET_KEY: "your_aws_secret_key"
  STRIPE_SECRET_KEY: "your_stripe_secret_key"
```

#### PostgreSQL Deployment

```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: nct-rental
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:14-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: nct_rental_prod
        - name: POSTGRES_USER
          value: nct_rental_user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: nct-rental-secrets
              key: DB_PASSWORD
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
  namespace: nct-rental
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: nct-rental
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
```

#### Backend Deployment

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nct-rental-backend
  namespace: nct-rental
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nct-rental-backend
  template:
    metadata:
      labels:
        app: nct-rental-backend
    spec:
      containers:
      - name: backend
        image: your-registry/nct-rental-backend:3.2.0
        ports:
        - containerPort: 8080
        envFrom:
        - configMapRef:
            name: nct-rental-config
        - secretRef:
            name: nct-rental-secrets
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend-service
  namespace: nct-rental
spec:
  selector:
    app: nct-rental-backend
  ports:
  - port: 8080
    targetPort: 8080
  type: ClusterIP
```

#### Frontend Deployment

```yaml
# frontend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nct-rental-frontend
  namespace: nct-rental
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nct-rental-frontend
  template:
    metadata:
      labels:
        app: nct-rental-frontend
    spec:
      containers:
      - name: frontend
        image: your-registry/nct-rental-frontend:2.5.1
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: nct-rental
spec:
  selector:
    app: nct-rental-frontend
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

#### Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nct-rental-ingress
  namespace: nct-rental
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - nct-rental.com
    - www.nct-rental.com
    secretName: nct-rental-tls
  rules:
  - host: nct-rental.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend-service
            port:
              number: 8080
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Apply configurations
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml

# Deploy services
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f backend-deployment.yaml
kubectl apply -f frontend-deployment.yaml

# Setup ingress
kubectl apply -f ingress.yaml

# Check status
kubectl get all -n nct-rental

# View logs
kubectl logs -f deployment/nct-rental-backend -n nct-rental
```

---

## Cloud Platform Deployment

### AWS Deployment

#### Using AWS Elastic Beanstalk

```bash
# Install EB CLI
pip install awsebcli

# Initialize EB
eb init -p docker nct-rental --region us-east-1

# Create environment
eb create nct-rental-prod --database.engine postgres --database.size 20

# Deploy
eb deploy

# Open application
eb open
```

#### Using AWS ECS/Fargate

1. Push Docker images to ECR
2. Create ECS cluster
3. Define task definitions
4. Create services
5. Configure Application Load Balancer
6. Setup RDS for PostgreSQL
7. Configure ElastiCache for Redis

### Google Cloud Platform (GCP)

#### Using Cloud Run

```bash
# Build and push to Container Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/nct-rental-backend

# Deploy to Cloud Run
gcloud run deploy nct-rental-backend \
  --image gcr.io/PROJECT_ID/nct-rental-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Microsoft Azure

#### Using Azure App Service

```bash
# Create resource group
az group create --name nct-rental-rg --location eastus

# Create App Service plan
az appservice plan create \
  --name nct-rental-plan \
  --resource-group nct-rental-rg \
  --sku P1V2 \
  --is-linux

# Create web app
az webapp create \
  --resource-group nct-rental-rg \
  --plan nct-rental-plan \
  --name nct-rental-backend \
  --deployment-container-image-name your-registry/nct-rental-backend:latest
```

---

## Configuration Guide

### Environment-Specific Settings

Refer to the `application.yml` file for comprehensive configuration options. Key configurations:

1. **Database**: Connection pool sizing based on traffic
2. **Security**: JWT tokens, OAuth2, SAML, 2FA
3. **Caching**: Redis configuration for session and data caching
4. **Integration**: Email, SMS, Payment gateways, OTA channels
5. **Monitoring**: Actuator endpoints, Prometheus metrics

### Configuration Best Practices

1. Use environment variables for sensitive data
2. Never commit secrets to version control
3. Use secret management services (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)
4. Implement configuration encryption
5. Use different configurations for each environment
6. Document all configuration parameters

---

## Security Best Practices

### 1. SSL/TLS Configuration

```bash
# Generate SSL certificate with Let's Encrypt
sudo certbot --nginx -d nct-rental.com -d www.nct-rental.com
```

### 2. Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Security Hardening

- Enable HTTPS only
- Implement CORS properly
- Use strong JWT secrets (512+ bits)
- Enable 2FA for admin accounts
- Implement rate limiting
- Use prepared statements (prevent SQL injection)
- Sanitize all user inputs
- Keep dependencies up to date
- Regular security audits
- Implement IP whitelisting for admin areas

### 4. Database Security

```sql
-- Restrict database user permissions
REVOKE ALL ON DATABASE nct_rental_prod FROM PUBLIC;
GRANT CONNECT ON DATABASE nct_rental_prod TO nct_rental_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nct_rental TO nct_rental_user;

-- Enable SSL for database connections
ALTER SYSTEM SET ssl = on;
```

---

## Performance Tuning

### JVM Tuning

```bash
java -jar \
  -Xms4g \
  -Xmx8g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:ParallelGCThreads=4 \
  -XX:ConcGCThreads=2 \
  -XX:InitiatingHeapOccupancyPercent=45 \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/nct-rental/heapdump.hprof \
  -Dserver.tomcat.threads.max=200 \
  -Dspring.profiles.active=production \
  nct-rental-backend.jar
```

### Database Optimization

```sql
-- Create indexes
CREATE INDEX CONCURRENTLY idx_bookings_customer_date ON bookings(customer_id, start_date);
CREATE INDEX CONCURRENTLY idx_vehicles_available ON vehicles(status) WHERE status = 'AVAILABLE';

-- Analyze tables
ANALYZE VERBOSE vehicles;
ANALYZE VERBOSE bookings;
ANALYZE VERBOSE customers;

-- Enable query statistics
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET track_activity_query_size = 4096;
```

### Redis Optimization

```bash
# Edit redis.conf
maxmemory 4gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Nginx Optimization

```nginx
# Increase worker processes
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Enable caching
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

    # Connection pooling
    upstream backend {
        least_conn;
        server localhost:8080 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }
}
```

---

## Monitoring Setup

### Prometheus

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nct-rental-backend'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['localhost:8080']
```

### Grafana Dashboards

Import Spring Boot dashboard:
- Dashboard ID: 11378 (Spring Boot Statistics)
- Dashboard ID: 4701 (JVM Dashboard)

### Application Monitoring

```yaml
# application.yml monitoring configuration
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: nct-rental-system
      environment: production
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

```bash
# Check database status
sudo systemctl status postgresql

# Check connection
psql -h localhost -U nct_rental_user -d nct_rental_prod

# Check logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

#### 2. Application Won't Start

```bash
# Check Java version
java -version

# Check port availability
sudo netstat -tuln | grep 8080

# Check application logs
tail -f /var/log/nct-rental/application.log

# Check system resources
free -h
df -h
```

#### 3. High Memory Usage

```bash
# Check JVM heap usage
jmap -heap <PID>

# Generate heap dump
jmap -dump:live,format=b,file=/tmp/heapdump.hprof <PID>

# Analyze with VisualVM or Eclipse MAT
```

#### 4. Slow Performance

```bash
# Check database queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';

# Check slow queries log
tail -f /var/log/postgresql/postgresql-14-main.log | grep "duration:"

# Check Redis performance
redis-cli --latency

# Check application metrics
curl http://localhost:8080/actuator/metrics
```

### Log Locations

- **Application Logs**: `/var/log/nct-rental/application.log`
- **Nginx Logs**: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- **PostgreSQL Logs**: `/var/log/postgresql/postgresql-14-main.log`
- **Systemd Logs**: `journalctl -u nct-rental-backend -f`

### Debug Mode

Enable debug logging:

```yaml
logging:
  level:
    root: DEBUG
    com.nct.rental: DEBUG
    org.springframework: DEBUG
```

### Health Checks

```bash
# Backend health
curl http://localhost:8080/actuator/health

# Database health
curl http://localhost:8080/actuator/health/db

# Redis health
curl http://localhost:8080/actuator/health/redis
```

---

## Support and Maintenance

### Backup Procedures

```bash
# PostgreSQL backup
pg_dump -h localhost -U nct_rental_user -Fc nct_rental_prod > backup_$(date +%Y%m%d).dump

# Restore from backup
pg_restore -h localhost -U nct_rental_user -d nct_rental_prod backup_20260101.dump

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U nct_rental_user -Fc nct_rental_prod > /backups/nct_rental_$DATE.dump
aws s3 cp /backups/nct_rental_$DATE.dump s3://nct-rental-backups/
```

### Update Procedures

1. Backup database and configurations
2. Stop the application
3. Deploy new version
4. Run database migrations
5. Start the application
6. Verify deployment
7. Monitor for errors

### Support Contacts

- **Technical Support**: support@nct-rental.com
- **Emergency Hotline**: +1-XXX-XXX-XXXX
- **Documentation**: https://docs.nct-rental.com
- **Status Page**: https://status.nct-rental.com

---

## Conclusion

This deployment guide covers comprehensive deployment strategies for the NCT Rental System. For specific deployment scenarios or additional support, please refer to the official documentation or contact the support team.

**Version**: 1.0.0
**Last Updated**: October 2026
**Maintained By**: NCT Rental Development Team
