const fs = require('fs')
const util = require('util')

const { Log } = require('debug-level')
const qrcode = require('qrcode-terminal')
const { Client, LocalAuth, MessageTypes } = require('whatsapp-web.js')

const log = new Log('whatsapp-community-bot')

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'],
    headless: false,
  },
})

const COMMUNITY_ID = '120363047641738769@g.us'
const MESSAGES_TO_CONSIDER_RECENT = 999999999

const NUMBER_OF_ACTIVE_USERS_TO_REPORT_PER_GROUP = 10

const INTERSECTION_FILE_NAME = 'group-intersections.csv'

const TYPES_OF_MESSAGES_TO_COUNT = new Set([
  MessageTypes.TEXT,
  MessageTypes.AUDIO,

  MessageTypes.VOICE,
  MessageTypes.IMAGE,
  MessageTypes.VIDEO,

  MessageTypes.DOCUMENT,
  MessageTypes.STICKER,
  MessageTypes.LOCATION,

  MessageTypes.REACTION, // emoji reaction
  MessageTypes.LIST_RESPONSE, // poll
  MessageTypes.BUTTONS_RESPONSE, // wa business buttons
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

  const usersByGroup = new Map()

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

      if (participants.has(userId)) {
        const currentUserInfo = participants.get(userId)
        participants.set(userId, {
          ...currentUserInfo,
          ...user,
          groups: [...currentUserInfo.groups, chat.name],
        })
      } else {
        user.groups = [chat.name]
        participants.set(userId, user)
      }
    }

    usersByGroup.set(
      chat.name,
      chat.participants.map((user) => user.id._serialized)
    )
  }

  log.info(
    `Loaded a total of ${participants.size} users including ${admins.size} admins (and ${communityAdmins.length} community admins)`
  )

  //await findInactiveUsers(sortedChats, participants, admins)
  await reportGroupIntersections(usersByGroup)
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
  log.debug('incoming_call', call)
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

// eslint-disable-next-line no-unused-vars
function detailedLog(label, object) {
  console.log(label, util.inspect(object, { depth: 3, colors: true }))
}

function convertToCSV(arr) {
  const array = [Object.keys(arr[0])].concat(arr)

  return array
    .map((it) => {
      return Object.values(it).toString()
    })
    .join('\n')
}

async function reportGroupIntersections(usersByGroupMap) {
  const groupIntersections = {}

  for (const [groupName, userIds] of usersByGroupMap.entries()) {
    const groupIntersection = { Name: groupName }

    for (const [otherGroupName, otherUserIds] of usersByGroupMap.entries()) {
      const intersection = userIds.filter((userId) =>
        otherUserIds.includes(userId)
      )

      groupIntersection[otherGroupName] = intersection.length / userIds.length
    }

    groupIntersections[groupName] = groupIntersection
  }

  console.info(
    `Group intersections have been written to ${INTERSECTION_FILE_NAME}`
  )
  fs.writeFileSync(
    INTERSECTION_FILE_NAME,
    convertToCSV(Object.values(groupIntersections))
  )
}

async function findInactiveUsers(sortedChats, participants, admins) {
  const missingUsersMessages = new Map()

  const idsThatHaveReadMessages = new Set()
  const idsThatHaveReceivedMessages = new Set()

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
      log.warn(
        `Found no messages in ${chat.name} is the current authenticated user a member of this group?`
      )
      continue
    }

    let messagesCheckedForReadStatus = 0
    const messagesPerUserInThisChat = new Map()
    for (const message of recentMessagesToCount) {
      const userId = message.author

      if (!userId) {
        // Skip system messages
        continue
      }

      // Delivery data is only available for messages I sent
      if (message.fromMe) {
        const messageInfo = await message.getInfo()

        const idsThatHaveReadMessage = messageInfo.read.map(
          (user) => user.id._serialized
        )
        const idsThatHaveReceivedMessage = messageInfo.delivery.map(
          (user) => user.id._serialized
        )

        idsThatHaveReadMessage.forEach((item) =>
          idsThatHaveReadMessages.add(item)
        )
        idsThatHaveReceivedMessage.forEach((item) =>
          idsThatHaveReceivedMessages.add(item)
        )

        messagesCheckedForReadStatus++
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
        log.warn(
          `Message from unknown user ${userId}, user not found in community, check this number - "${message.body.slice(
            0,
            100
          )}..."`
        )
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
        ([_aUserId, aMessages], [_bUserId, bMessages]) =>
          bMessages.length - aMessages.length
      )
      .splice(0, NUMBER_OF_ACTIVE_USERS_TO_REPORT_PER_GROUP)

    for (const [userId, messages] of mostActiveUsersInGroup) {
      log.debug(`User ${userId} has sent ${messages.length} messages`)
    }

    log.info(
      `Additionally ${messagesCheckedForReadStatus} sent by authenticated user for read status were checked`
    )
  }

  const usersToConsiderForInactivity = Array.from(
    participants.entries()
  ).filter(([userId, _user]) => !admins.has(userId))

  log.info(
    `Of ${participants.size} considering ${usersToConsiderForInactivity.length} as potentially inactive`
  )

  const inactiveUsers = usersToConsiderForInactivity
    .map(([userId, user]) => {
      user.messageCount = user.messages?.length ?? 0
      return [userId, user]
    })
    .filter(([_userId, user]) => user.messageCount === 0)

  log.info(
    `Found ${inactiveUsers.length} users who haven't sent a message in the last ${MESSAGES_TO_CONSIDER_RECENT} messages of any group`
  )

  //detailedLog('inactiveUsers', inactiveUsers)
  const usersWhoHaveNotReadAMessage = inactiveUsers.filter(
    ([userId, _user]) => !idsThatHaveReadMessages.has(userId)
  )
  const usersWhoHaveNotReceivedAMessage = usersWhoHaveNotReadAMessage.filter(
    ([userId, _user]) => !idsThatHaveReceivedMessages.has(userId)
  )

  log.info(
    `Of those users ${usersWhoHaveNotReadAMessage.length} have not read a message (send by authenticated user) and ${usersWhoHaveNotReceivedAMessage.length} have never received a message`
  )

  //detailedLog(usersWhoHaveNotReadAMessage.map(([userId, user]) => `${user.id._serialized}|||${user.groups.join(", ")}`).join("\n"))

  console.log('Done')
}

/*
const siebertNumbers = `2975667551
4560905805
32456210472
32456244655
32456407899
32456624272
32456630278
32465236144
32465315336
32466027821
32466461988
32470618749
32471402315
32471898302
32473550008
32473751593
32474802258
32476752843
32478177146
32483264092
32485237315
32487194390
32488071614
32491194107
32492488423
32492883293
32493887724
32494368388
32494435936
32494848951
32494990991
32495732065
32496609008
32497363602
32497701463
32499235750
32499288865
33760189301
36204518774
36501217036
36706389056
38630339266
38651269899
48666828177
79260925439
306977019314
306986060545
351915979480
380950183368
393881425424
420733436527
886972345580
905305542742
919874238071
919941387966
2126726679783
4366473744374
4915735586156
4915738399491
4916094455601`.split('\n')

  const siebertPeople = [];

  siebertNumbers.forEach(number => {
    const user = participants.get(`${number}@c.us`)
    if (user) {
      siebertPeople.push(user)
    }
  })*/
