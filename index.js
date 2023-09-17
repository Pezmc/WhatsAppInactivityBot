const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js')

const qrcode = require('qrcode-terminal')

const util = require('util')

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'],
    headless: false,
  },
})

function log(label, object) {
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
  console.log('Client is ready!')

  const community = await client.getChatById(COMMUNITY_ID)

  const communityAdmins = community.participants.filter((user) => user.isAdmin)

  console.info(`Grabbing all participants for "${community.name}"`)
  console.info(`Loaded ${communityAdmins.length} community admins`)

  const allChats = await client.getChats()

  const communityChats = allChats
    .filter((chat) => chat.isGroup)
    .filter(
      (chat) => chat.groupMetadata.parentGroup?._serialized === COMMUNITY_ID
    )

  console.info(
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

    console.info(
      `Chat ${chat.name} has ${chatUsers.length} normal users plus ${chatAdmins.length} group admin(s)`
    )

    if (chatUsers.length) {
      console.warn(`Chat ${chat.name} has no users, is the authenticated user a member of the group?`)
    }

    for (const user of chat.participants) {
      const userId = user.id._serialized
      if (user.isAdmin) {
        admins.set(userId, user)
        participants.delete(userId) // may have been previously added from another group
      } else {
        participants.set(user.id._serialized, user)
      }
    }
  }

  console.info(
    `Loaded a total of ${participants.size} users plus ${admins.size} admins (including ${communityAdmins.length} community admins)`
  )

  /*
  groupMetadata.parentGroup: {
    server: 'g.us',
    user: '120363047641738769',
    _serialized: '120363047641738769@g.us'
  },*/

  for (const chat of sortedChats) {
    console.info(
      `Checking ${MESSAGES_TO_CONSIDER_RECENT} most recent messages from ${chat.name}`
    )

    const recentMessages = await chat.fetchMessages({
      limit: MESSAGES_TO_CONSIDER_RECENT,
    })
    const recentMessagesToCount = recentMessages.filter((message) =>
      TYPES_OF_MESSAGES_TO_COUNT.has(message.type)
    )

    console.debug(
      `Filtered out ${
        recentMessages.length - recentMessagesToCount.length
      } non-countable messages`
    )

    const messagesPerUserInThisChat = new Map()
    for (const message of recentMessagesToCount) {
      const userId = message.author

      console.log(message)

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
        console.warn(`Message from unknown user ${userId}`)
        log('message', message)
      } else {
        if (!user.messages) {
          user.messages = [message]
        } else {
          user.messages.push(message)
        }
      }
    }

    log(messagesPerUserInThisChat.entries())

    const mostActiveUsersInThisGroup = Array.from(
      messagesPerUserInThisChat.entries()
    ).sort((a, b) => b[0].length - a[0].length)

    for (const [userId, messages] of mostActiveUsersInThisGroup.splice(
      0,
      NUMBER_OF_ACTIVE_USERS_TO_REPORT_PER_GROUP
    )) {
      console.info(
        `User ${userId} has sent ${messages.length} messages (looked at last ${MESSAGES_TO_CONSIDER_RECENT})`
      )
    }
  }
})

client.on('message', (msg) => {
  console.log('Message received', msg)
})

// All other

client.on('auth_failure', (message) => {
  console.log('Auth failure', message)
})

client.on('authenticated', () => {
  console.log('authenticated')
})

client.on('change_battery', (batteryInfo) => {
  console.log('change_battery', batteryInfo)
})

client.on('change_state', (state) => {
  console.log('change_state', state)
})

client.on('chat_archived', (chat, currentState, previousState) => {
  console.log('chat_archived', chat, currentState, previousState)
})

client.on('chat_removed', (chat) => {
  console.log('chat_removed', chat)
})

/* Noisy
client.on('contact_changed', (message, oldId, newId, isContact) => {
  console.log('contact_changed', message, oldId, newId, isContact)
})
*/

client.on('disconnected', (reason) => {
  console.log('disconnected', reason)
})

client.on('group_admin_changed', (notification) => {
  console.log('group_admin_changed', notification)
})

client.on('group_join', (notification) => {
  console.log('group_join', notification)
})

client.on('group_leave', (notification) => {
  console.log('group_leave', notification)
})

client.on('group_update', (notification) => {
  console.log('group_update', notification)
})

client.on('incoming_call', (call) => {
  console.log('incoming_call', cal)
})

client.on('media_uploaded', (message) => {
  console.log('media_uploaded', message)
})

/* Noisy
client.on('message_ack', (message, ack) => {
  console.log('message_ack', message, ack)
})
*/

/* Noisy
client.on('message_create', (message) => {
  console.log('message_create', message)
})
*/

/* Noisy 
client.on('message_edit', (message, newBody, oldBody) => {
  console.log('message_edit', message, newBody, oldBody)
})
*/

/* Noisy
client.on('message_reaction', (reaction) => {
  console.log('message_reaction', reaction)
})
*/

client.on('message_revoke_everyone', (message, revoked_msg) => {
  console.log('message_revoke_everyone', message, revoked_msg)
})

client.on('message_revoke_me', (message) => {
  console.log('message_revoke_me', message)
})

client.initialize()

console.log('Client initialized')
