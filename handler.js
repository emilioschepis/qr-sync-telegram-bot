'use strict';

const fs = require('fs')
const os = require('os')
const Jimp = require('jimp')
const jsQR = require('jsqr')
const vCard = require('vcard-parser');
const Bot = require('node-telegram-bot-api')
const AWS = require('aws-sdk')

const bot = new Bot(process.env.TELEGRAM_TOKEN, { polling: false })
const db = new AWS.DynamoDB.DocumentClient()

const response = {
  statusCode: 200,
  body: JSON.stringify({
    done: true
  })
}

module.exports.message = async (event) => {
  console.log(`Handling event.`, event.body)
  const body = JSON.parse(event.body)

  const chatId = body.message.chat.id

  try {
    if (await checkAlreadyHandled(body.update_id)) {
      console.log(`Received old event, ignoring.`)
      await sendErrorMessage(chatId)
    } else {
      await handleIncomingMessage(body.message)
    }
  } catch (error) {
    console.error(`Error handling event.`, error)
    await sendErrorMessage(chatId)
  } finally {
    return response
  }
}

/**
 * Checks if the message has already been handled.
 * If the message is new updates the DynamoDB table.
 * 
 * @param {number} current
 * @return false if the message is new. 
 */
async function checkAlreadyHandled(current) {
  const params = {
    TableName: process.env.DYNAMODB_UPDATE_TABLE,
    Key: {
      id: 'latest_update_id'
    }
  }

  const result = await db.get(params).promise()
  const latest = result.Item['latest_update_id']

  if (latest < current) {
    // This is a brand new request.
    const params = {
      TableName: process.env.DYNAMODB_UPDATE_TABLE,
      Key: {
        id: 'latest_update_id',
      },
      ExpressionAttributeNames: {
        '#latest': 'latest_update_id',
      },
      ExpressionAttributeValues: {
        ':latest': current,
      },
      UpdateExpression: 'SET #latest = :latest',
      ReturnValues: 'NONE',
    };

    await db.update(params).promise()
    return false
  } else {
    return true
  }
}

/**
 * Handles any incoming messages.
 * 
 * @param {TelegramBot.Message} message The message to handle.
 */
async function handleIncomingMessage(message) {
  if (message.text) {
    return handleTextMessage(message)
  } else if (message.photo && message.photo.length > 0) {
    return handlePhotoMessage(message)
  } else {
    return Promise.resolve()
  }
}

/**
 * Handles messages that contain a text.
 * It sends a message back if the user selected a known command.
 * 
 * @param {TelegramBot.Message} message The message to handle. 
 * Its `text` property is defined.
 */
async function handleTextMessage(message) {
  switch (message.text) {
    case '/start':
      const startMessage = `Hi, I'm QR Sync Bot! I can decode your QR codes.`
      return sendMarkdownMessage(message.chat.id, startMessage)
    case '/about':
      const aboutMessage = `I was created by @emilioschepis. You can find my code on [GitHub](https://github.com/emilioschepis/qr-sync-telegram-bot).`
      return sendMarkdownMessage(message.chat.id, aboutMessage)
    case '/app':
      const appMessage = `Are you on Android? Download the [QR Sync app](https://play.google.com/store/apps/details?id=com.emilioschepis.qrsync)!\
      \nIt is completely free and [open source](https://github.com/emilioschepis/qrsync).\
      \nYou'll be able to scan a wide variety of codes keeping them synced in the cloud.`
      return sendMarkdownMessage(message.chat.id, appMessage)
    default:
      return Promise.resolve()
  }
}

/**
 * Handles messages that contain a photo.
 * This method quits early if the photo is too large.
 * 
 * @param {TelegramBot.Message} message The message to handle. 
 * Its `photo` property is defined.
 */
async function handlePhotoMessage(message) {
  const photo = message.photo[message.photo.length - 1]
  const sizeLimit = parseInt(process.env.MAX_PHOTO_SIZE)

  // If the photo is too large, do not decode it.
  if (photo.width > sizeLimit || photo.height > sizeLimit) {
    const sizeLimitMessage = `I'm sorry, I will only decode images up to ${sizeLimit}x${sizeLimit}.`
    return sendMarkdownMessage(message.chat.id, sizeLimitMessage)
  }

  const startMessage = `Give me a second, I'm decoding your photo...`
  await sendMarkdownMessage(message.chat.id, startMessage)

  const data = await decodePhoto(photo)

  if (data === '') {
    const emptyMessage = `The code you sent could not be decoded.`
    return sendMarkdownReply(message.chat.id, message.message_id, emptyMessage)
  } else if (data.startsWith('BEGIN:VCARD')) {
    const doneMessage = `*I decoded your QR code!*\nHere's the contact it contains:`
    await sendMarkdownMessage(message.chat.id, doneMessage)
    return sendContactReply(message.chat.id, message.message_id, data)
  } else {
    const doneMessage = `*I decoded your QR code!*\nHere's the text it contains:`
    await sendMarkdownMessage(message.chat.id, doneMessage)
    return sendMarkdownReply(message.chat.id, message.message_id, data)
  }
}

/**
 * Starts the decoding process of a photo. 
 * 
 * @param {TelegramBot.Photo} photo The array of different resolutions of the photo.
 * @return The decoded text.
 */
async function decodePhoto(photo) {
  // Save the file to the `/tmp` directory.
  const path = await bot.downloadFile(photo.file_id, os.tmpdir())

  // Read the image data.
  const image = await Jimp.read(path)

  // Decode the QR code's content.
  const result = await decodeBitmap(image.bitmap)

  // Remove the downloaded file from the `/tmp` directory.
  fs.unlinkSync(path)

  return Promise.resolve(result)
}

/**
 * Decodes the QR code in the bitmap using the 
 * [jsQR library](https://github.com/cozmo/jsQR).
 * 
 * @param {Bitmap} bitmap 
 * @return The decoded text or blank.
 */
async function decodeBitmap(bitmap) {
  return new Promise((resolve, _) => {
    const result = jsQR(bitmap.data, bitmap.width, bitmap.height)
    resolve(result.data || '')
  })
}

/**
 * Asynchronously sends the error message to the user through the bot.
 * 
 * @param {string} chatId The chat id to send the message to.
 */
async function sendErrorMessage(chatId) {
  const message = 'There was a problem with your request.'
  return bot.sendMessage(chatId, message)
}

/**
 * Sends a markdown-styled message to the user.
 * 
 * @param {string} chatId The chat id to send the message to.
 * @param {string} message The message to send.
 * @param {TelegramBot.SendMessageOptions} options An additional array of
 * options for the message.
 */
async function sendMarkdownMessage(chatId, message, options) {
  return bot.sendMessage(chatId, message, {
    ...options,
    parse_mode: 'Markdown'
  })
}

/**
 * Sends a markdown-styled message as a reply to a specific message.
 * 
 * @param {string} chatId The chat id to send the message to.
 * @param {number} messageId The message to reply to.
 * @param {string} message The message to send.
 */
async function sendMarkdownReply(chatId, messageId, message) {
  return sendMarkdownMessage(chatId, message, {
    reply_to_message_id: messageId
  })
}

/**
 * Sends a contact object as a reply to a specific message.
 * 
 * @param {string} chatId The chat id to send the message to.
 * @param {number} messageId The message to reply to.
 * @param {string} vcard The contact data.
 */
async function sendContactReply(chatId, messageId, vcard) {
  const properties = extractProperties(vcard)

  return bot.sendContact(chatId, properties.telephone, properties.name, {
    vcard: vcard,
    reply_to_message_id: messageId
  })
}

/**
 * Extracts a name and a telephone number from a vCard
 * if they exist. 
 * Returns default values otherwise.
 * 
 * @param {string} vcard The contact data.
 */
function extractProperties(vcard) {
  const card = vCard.parse(vcard)

  var name = 'No name found'
  var telephone = '123456789'

  // Only check the name if one exists.
  if (card.fn) {
    card.fn.forEach(fn => {
      if (fn.value.trim() !== '') {
        name = fn.value
      }
    })
  }

  // Only check the telephone if one exists.
  if (card.tel) {
    card.tel.forEach(tel => {
      if (tel.value.trim() !== '') {
        telephone = tel.value
      }
    })
  }

  return { 
    'name': name,
    'telephone': telephone
  }
}
