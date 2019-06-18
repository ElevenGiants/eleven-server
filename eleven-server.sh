#!/bin/bash
PATH="/home/vagrant/.nvm/versions/node/v6.17.1/bin:$PATH" # manually set PATH for npm since sudo can't use npm
cd /vagrant/eleven-server
npm start || echo 'if node version is no longer v6.17.1 this script will fail and need to be updated' # error message to show in log on fail.