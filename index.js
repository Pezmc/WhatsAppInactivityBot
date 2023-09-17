const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js')

const qrcode = require('qrcode-terminal')

const util = require('util')

const { Log, logger } = require('debug-level')

const log = new Log('whatsapp-community-bot')

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'],
    headless: false,
  },
})

function detailedLog(label, object) {
  console.log(label, util.inspect(object, { depth: 3, colors: true }))
}

const COMMUNITY_ID = '120363047641738769@g.us'
const MESSAGES_TO_CONSIDER_RECENT = 100

const NUMBER_OF_ACTIVE_USERS_TO_REPORT_PER_GROUP = 10

const TYPES_OF_MESSAGES_TO_COUNT = new Set([
  MessageTypes.TEXT,
  MessageTypes.AUDIO,

  MessageTypes.VOICE,
  MessageTypes.IMAGE,
  MessageTypes.VIDEO,

  MessageTypes.DOCUMENT,
  MessageTypes.STICKER,
  MessageTypes.LOCATION,
])

// Handles events
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true })
})

client.on('ready', async () => {
  log.debug('Client is ready!')

  const community = await client.getChatById(COMMUNITY_ID)

  const communityAdmins = community.participants.filter((user) => user.isAdmin)

  log.info(`Grabbing all participants for "${community.name}"`)
  log.info(`Loaded ${communityAdmins.length} community admins`)

  const allChats = await client.getChats()

  const communityChats = allChats
    .filter((chat) => chat.isGroup)
    .filter(
      (chat) => chat.groupMetadata.parentGroup?._serialized === COMMUNITY_ID
    )

  log.info(
    `Loaded ${communityChats.length} chats that are part of the community`
  )

  const participants = new Map()
  const admins = new Map()

  const sortedChats = communityChats.sort(
    (a, b) => b.participants.length - a.participants.length
  )

  for (const chat of sortedChats) {
    const chatUsers = chat.participants.filter((user) => !user.isAdmin)
    const chatAdmins = chat.participants.filter((user) => user.isAdmin)

    log.info(
      `Chat ${chat.name} has ${chatUsers.length} normal users plus ${chatAdmins.length} group admin(s)`
    )

    if (!chatUsers.length) {
      log.warn(
        `Chat ${chat.name} has no users, is the currently authenticated user a member of the group?`
      )
    }

    for (const user of chat.participants) {
      const userId = user.id._serialized
      if (user.isAdmin) {
        admins.set(userId, user)
      }

      participants.set(user.id._serialized, user)
    }
  }

  log.info(
    `Loaded a total of ${participants.size} users including ${admins.size} admins (and ${communityAdmins.length} community admins)`
  )

  /*
  groupMetadata.parentGroup: {
    server: 'g.us',
    user: '120363047641738769',
    _serialized: '120363047641738769@g.us'
  },*/

  const missingUsersMessages = new Map()

  for (const chat of sortedChats) {
    log.info(
      `Checking ${MESSAGES_TO_CONSIDER_RECENT} most recent messages from ${chat.name}`
    )

    const recentMessages = await chat.fetchMessages({
      limit: MESSAGES_TO_CONSIDER_RECENT,
    })
    const recentMessagesToCount = recentMessages.filter((message) =>
      TYPES_OF_MESSAGES_TO_COUNT.has(message.type)
    )

    log.debug(
      `Filtered out ${
        recentMessages.length - recentMessagesToCount.length
      } non-countable messages`
    )

    if (!recentMessagesToCount.length) {
      log.warn(`Found no messages in ${chat.name} is the current authenticated user a member of this group?`)
      continue;
    }

    const messagesPerUserInThisChat = new Map()
    for (const message of recentMessagesToCount) {
      const userId = message.author

      if (!userId) {
        // Skip system messages
        continue
      }

      // This chat
      if (messagesPerUserInThisChat.has(userId)) {
        messagesPerUserInThisChat.get(userId).push(message)
      } else {
        messagesPerUserInThisChat.set(userId, [message])
      }

      // All chats
      const user = participants.get(userId)
      if (!user) {
        log.warn(`Message from unknown user ${userId}, user not found in community, check this number - "${message.body.slice(0, 100)}..."`)
        if (!missingUsersMessages.has(userId)) {
          missingUsersMessages.set(userId, [])
        }

        missingUsersMessages.get(userId).push(message)
      } else {
        if (!user.messages) {
          user.messages = [message]
        } else {
          user.messages.push(message)
        }
      }
    }

    const mostActiveUsersInGroup = Array.from(
      messagesPerUserInThisChat.entries()
    )
      .sort(
        ([aUserId, aMessages], [bUserId, bMessages]) =>
          bMessages.length - aMessages.length
      )
      .splice(0, NUMBER_OF_ACTIVE_USERS_TO_REPORT_PER_GROUP)

    for (const [userId, messages] of mostActiveUsersInGroup) {
      log.debug(
        `User ${userId} has sent ${messages.length} messages`
      )
    }
  }
})

client.on('message', (msg) => {
  log.debug('Message received', msg)
})

// All other

client.on('auth_failure', (message) => {
  log.debug('Auth failure', message)
})

client.on('authenticated', () => {
  log.debug('authenticated')
})

client.on('change_battery', (batteryInfo) => {
  log.debug('change_battery', batteryInfo)
})

client.on('change_state', (state) => {
  log.debug('change_state', state)
})

client.on('chat_archived', (chat, currentState, previousState) => {
  log.debug('chat_archived', chat, currentState, previousState)
})

client.on('chat_removed', (chat) => {
  log.debug('chat_removed', chat)
})

/* Noisy
client.on('contact_changed', (message, oldId, newId, isContact) => {
  log.debug('contact_changed', message, oldId, newId, isContact)
})
*/

client.on('disconnected', (reason) => {
  log.debug('disconnected', reason)
})

client.on('group_admin_changed', (notification) => {
  log.debug('group_admin_changed', notification)
})

client.on('group_join', (notification) => {
  log.debug('group_join', notification)
})

client.on('group_leave', (notification) => {
  log.debug('group_leave', notification)
})

client.on('group_update', (notification) => {
  log.debug('group_update', notification)
})

client.on('incoming_call', (call) => {
  log.debug('incoming_call', cal)
})

client.on('media_uploaded', (message) => {
  log.debug('media_uploaded', message)
})

/* Noisy
client.on('message_ack', (message, ack) => {
  log.debug('message_ack', message, ack)
})
*/

/* Noisy
client.on('message_create', (message) => {
  log.debug('message_create', message)
})
*/

/* Noisy 
client.on('message_edit', (message, newBody, oldBody) => {
  log.debug('message_edit', message, newBody, oldBody)
})
*/

/* Noisy
client.on('message_reaction', (reaction) => {
  log.debug('message_reaction', reaction)
})
*/

client.on('message_revoke_everyone', (message, revoked_msg) => {
  log.debug('message_revoke_everyone', message, revoked_msg)
})

client.on('message_revoke_me', (message) => {
  log.debug('message_revoke_me', message)
})

client.initialize()

log.info('Client initializing')
