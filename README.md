# Memer Telegram Bot - Search &amp; Create memes!

Bot Link - https://t.me/meme_mtwn105_bot

![Memer Bot](https://user-images.githubusercontent.com/12975481/155880694-8ee48292-0179-47fd-8899-c5328628e141.jpg)

## All in one telegram bot for meme-ing!

### Features:
- **Search from a collection of thousands of memes**
- **Create memes using many meme templates available**
- **Create custom memes by uploading your image and adding text**

## Tech Stack

- NodeJS
- Express
- Telebot
- Redis

## Devops

Application has deployed on Microsoft Azure using Azure Kubernetes Services (AKS).
Two deployments created, one for Redis & one for NodeJS express (which is deployed using the docker image)

All environment variables required are stored in the Kubernetes secrets.

- Azure Kubernetes Service
  - Redis Kubernetes Pod
  - Memer NodeJs Express Kubernetes Pod

## Architecture Diagram

![Memer_Architecture](https://user-images.githubusercontent.com/12975481/156997559-00fe8078-6395-46fc-aefa-d3c3ae70463e.png)



