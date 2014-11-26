#!/usr/bin/env bash

# deployment script executed on the remote/target host by deploy.sh (via SSH)

set -xe

rm -rf /eleven/eleven-server.old
[[ ! -d /eleven/eleven-server ]] || mv /eleven/eleven-server /eleven/eleven-server.old
mv /eleven/eleven-server.new /eleven/eleven-server
sudo /bin/systemctl restart eleven-server
