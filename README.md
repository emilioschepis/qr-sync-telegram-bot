# QR Sync Telegram Bot
[![Telegram](https://img.shields.io/badge/Telegram-QRSyncBot-2196f3.svg)](https://t.me/qrsyncbot)

**QR Sync Bot** is a Telegram bot that allows users to decode the content of any 2D QR code.
The bot will decode photos up to 1280x1280px taken from the camera or the camera roll.
It is a very simplified version of the open source Android app [QR Sync](https://github.com/emilioschepis/qrsync).

Try it out at [@QRSyncBot](https://t.me/qrsyncbot)

The whole logic of this application runs through a single AWS Lambda Function that is
responsible of handling the Telegram Webhook.
The various resources are created and mantained through the Serverless Framework.

## External dependencies
- [Lambda Functions](https://aws.amazon.com/lambda/)
- [Telegram API](https://core.telegram.org/bots/api)
- [Serverless Framework](https://serverless.com)
- [@yagop](https://github.com/yagop)'s [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) module.
- [@cozmo](https://github.com/cozmo)'s [jsQR](https://github.com/cozmo/jsQR) module.
- [@Heymdall](https://github.com/Heymdall)'s [vcard](https://github.com/Heymdall/vcard) module.
