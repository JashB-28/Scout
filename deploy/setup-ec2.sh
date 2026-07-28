#!/usr/bin/env bash
# One-time bootstrap for a fresh Amazon Linux 2023 EC2 instance.
# Installs Docker + the compose plugin + git, and adds swap so the
# Next.js build doesn't run out of memory on a 1 GiB t3.micro.
#
# Run once:  bash deploy/setup-ec2.sh   (then log out/in for the docker group)
set -euo pipefail

echo ">> Updating packages and installing docker + git..."
sudo dnf update -y
sudo dnf install -y docker git

echo ">> Installing the docker compose v2 plugin..."
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL \
  "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

echo ">> Enabling docker and adding ec2-user to the docker group..."
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# 2 GiB swap — a t3.micro only has 1 GiB RAM, not enough to build the
# frontend image. Skip if swap already exists.
if ! sudo swapon --show | grep -q /swapfile; then
  echo ">> Creating 2 GiB swap file..."
  sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo ">> Done. Log out and back in (or run 'newgrp docker') so docker works"
echo ">> without sudo, then continue with the deploy steps."
