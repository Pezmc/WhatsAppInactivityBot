import fs from 'fs'
import util from 'util'

import { Log } from 'debug-level'
import inquirer from 'inquirer'
import qrcode from 'qrcode-terminal'
import WhatsAppWeb from 'whatsapp-web.js'

const { Client, LocalAuth, MessageTypes } = WhatsAppWeb

//// Config ////
const COMMUNITY_ID = '120363047641738769@g.us'

// Inactive users
const DAYS_OF_MESSAGES_TO_CONSIDER_RECENT = 90
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

// People joining groups
const TYPES_OF_MESSAGES_FOR_JOINS = new Set([MessageTypes.GP2])
const SUBTYPES_OF_MESSAGES_FOR_JOINS = new Set([
  'linked_group_join', // joins using community link
  'invite_auto_add', // joins using group link
  'add', // admin adds them
])
const DAYS_TO_CONSIDER_RECENT_JOINS = 30 // If someone has joined in this many days, they are not considered inactive
const UNREAD_INACTIVE_USERS_FILE_NAME = 'inactive-users-unread.csv'
const UNDELIVERED_INACTIVE_USERS_FILE_NAME = 'inactive-users-undelivered.csv'

// Reporting
const NUMBER_OF_ACTIVE_USERS_TO_REPORT_PER_GROUP = 10
const INTERSECTION_FILE_NAME = 'group-intersections.csv'
const USERS_ONLY_IN_ONE_GROUP_FILE_NAME = 'users-only-in-one-group.csv'

//// Setup ////
const log = new Log('whatsapp-community-bot')

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'],
    headless: false,
  },
})

//// Event Handling ////
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true })
})

client.on('ready', async () => {
  log.debug('Client ready, version:', await client.getWWebVersion())

  const allChats = await client.getChats()

  const communities = allChats.filter((chat) => chat.isGroup && chat.groupMetadata.isParentGroup)
  
  const answer = await inquirer.prompt([
    {
      type: 'rawlist',
      name: 'community',
      message: 'Which community would you like to report on?',
      choices: [
        ...communities.map((community) => ({ name: community.name, value: community.id._serialized })),
        { name: 'Exit', value: null },
      ],
    },
  ]) 

  if (!answer.community) {
    log.info('No community selected, exiting')
    process.exit(0)
  }

  const communityId = answer.community
  const community = await client.getChatById(communityId)

  if (!community) {
    log.error('Community not found, exiting')
    process.exit(1)
  }

  const communityAdmins = community.participants.filter((user) => user.isAdmin)

  log.info(`Grabbing all participants for "${community.name}"`)
  log.info(`Loaded ${communityAdmins.length} community admins`)

  const communityChats = allChats
    .filter((chat) => chat.isGroup)
    .filter(
      (chat) => chat.groupMetadata.parentGroup?._serialized === communityId
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

  main(community, sortedChats, participants, admins, usersByGroup)
})

client.on('message', (msg) => {
  log.debug('Message received', msg)
})

// All other events
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

/// Helpers
// eslint-disable-next-line no-unused-vars
function detailedLog(label, object) {
  console.log(label, util.inspect(object, { depth: 10, colors: true }))
}

function convertToCSV(arr) {
  const array = [Object.keys(arr[0])].concat(arr)

  return array
    .map((it) => {
      return Object.values(it)
        .map((value) =>
          '"' + String(value).replace(/"/g, '""') + '"'
        )
        .join(',')
    })
    .join('\n')
}

/// Interactivity

async function main(
  community,
  sortedChats,
  participants,
  admins,
  usersByGroup
) {
  do {
    const answers = await inquirer.prompt([
      {
        type: 'rawlist',
        name: 'action',
        message: 'Which would you like to do?',
        choices: [
          { name: 'Report Group Intersections', value: 'report_intersections' },
          { name: 'Report Inactive Users in Specific Group', value: 'report_inactive_specific_group' },
          { name: 'Report Inactive Users in All Groups', value: 'report_inactive' },
          { name: 'Report Users Only in One Group', value: 'report_users_only_in_one_group' },
          { name: 'Remove Users', value: 'remove_users' },
          new inquirer.Separator(),
          { name: 'Exit', value: 'exit' },
        ],
      },
    ])

    switch (answers.action) {
      case 'report_intersections':
        await reportGroupIntersections(usersByGroup)
        break
      case 'report_inactive_specific_group':
        await findInactiveUsersInSpecificGroup(sortedChats, participants, admins)
        break
      case 'report_inactive':
        await findInactiveUsers(sortedChats, participants, admins)
        break
      case 'remove_users':
        await removeUsers(community, participants)
        break
      case 'report_users_only_in_one_group':
        await reportUsersOnlyInOneGroup(sortedChats, participants, admins)
        break
      case 'exit':
        process.exit(0)
        break
      default:
        log.error('Unknown action', answers.action)
        break
    }
  } while (true) // eslint-disable-line no-constant-condition
}

/// Main Functions

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

  const fileName = `${new Date().toISOString().split('T')[0]}-${INTERSECTION_FILE_NAME}`
  console.info(
    `Group intersections have been written to ${fileName}`
  )
  fs.writeFileSync(
    fileName,
    convertToCSV(Object.values(groupIntersections))
  )
}

const ALL = 9999999999 
const MESSAGES_TO_CONSIDER_RECENT = 9999999999 // Infinity is not supported
const SECONDS_IN_DAY = 60 * 60 * 24

async function findInactiveUsersInSpecificGroup(sortedChats, participants, admins) {
  debugger;

  const answer = await inquirer.prompt([
    {
      type: 'rawlist',
      name: 'group_id',
      message: 'Which group would you like to report on?',
      choices:  [
        ...sortedChats.filter((chat) => !chat.groupMetadata.isParentGroup).map((chat) => ({ name: chat.name, value: chat.id._serialized })),
        new inquirer.Separator(),
        { name: 'Back', value: 'exit' },
      ]
    },
  ])

  if (answer.group_id === 'exit') {
    return
  }

  const group = sortedChats.find((chat) => chat.id._serialized === answer.group_id)
  if (!group) {
    log.error('Group not found, exiting')
    process.exit(1)
  }

  await findInactiveUsers([group], participants, admins)
} 

async function findInactiveUsers(sortedChats, participants, admins) {
  const missingUsersMessages = new Map()

  const idsThatHaveReadMessages = new Set()
  const idsThatHaveReceivedMessages = new Set()

  const secondsOfMessagesToConsiderRecent =
    DAYS_OF_MESSAGES_TO_CONSIDER_RECENT * SECONDS_IN_DAY

  const allMessages = []

  for (const chat of sortedChats) {
    log.debug(
      `Loading ${MESSAGES_TO_CONSIDER_RECENT === ALL ? 'all' : MESSAGES_TO_CONSIDER_RECENT} most recent messages from ${chat.name} and considering only those from last ${DAYS_OF_MESSAGES_TO_CONSIDER_RECENT} days`
    )

    const recentMessages = await chat.fetchMessages({
      limit: MESSAGES_TO_CONSIDER_RECENT,
    })

    const recentMessagesToCount = recentMessages.filter(
      (message) =>
        TYPES_OF_MESSAGES_TO_COUNT.has(message.type) &&
        message.timestamp >
          (Date.now() - secondsOfMessagesToConsiderRecent * 1000) / 1000
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
      let userId = message.author
      if (!userId) {
        // Skip system messages
        continue
      }
       
      allMessages.push(message)

      // Fix API issue where user ID is not properly formatted
      userId = userId.replace(/:\d+@/, '@')

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
        log.debug(
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

    // Check join and group add events separately
    const secondsToConsiderJoinsAsRecent =
      SECONDS_IN_DAY * DAYS_TO_CONSIDER_RECENT_JOINS

    const groupJoinMessages = recentMessages.filter((message) => {
      return (
        TYPES_OF_MESSAGES_FOR_JOINS.has(message.type) &&
        SUBTYPES_OF_MESSAGES_FOR_JOINS.has(message.rawData.subtype) &&
        message.timestamp >
          (Date.now() - secondsToConsiderJoinsAsRecent * 1000) / 1000
      )
    })

    log.debug(
      `Considering ${groupJoinMessages.length} join events from the last ${DAYS_TO_CONSIDER_RECENT_JOINS} days and marking those users active`
    )

    for (const message of groupJoinMessages) {
      const userId = message.id.participant._serialized // user that was added by someone or added themselves

      if (!userId) {
        // Skip system messages
        continue
      }

      // All chats
      const user = participants.get(userId)
      if (!user) {
        log.debug(
          `Join event from unknown user ${userId}, user not found in community, check this number`
        )

        if (!missingUsersMessages.has(userId)) {
          missingUsersMessages.set(userId, [])
        }

        missingUsersMessages.get(userId).push(message)
      } else {
        log.debug(userId, 'has joined recently in', chat.name)
        if (!user.messages) {
          user.messages = [message]
        } else {
          user.messages.push(message)
        }
      }
    }

    const oldestDate = recentMessagesToCount?.[0].timestamp ? new Date(recentMessagesToCount?.[0].timestamp * 1000) : null

    log.info(`Checked ${recentMessagesToCount.length} messages in ${chat.name}, plus ${groupJoinMessages.length} join events, and ${messagesCheckedForReadStatus} messages sent by authenticated user for read status, the oldest message was ${oldestDate.toISOString()}`)
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
    `Found ${inactiveUsers.length} users who haven't sent a message or joined a group in the last ${DAYS_OF_MESSAGES_TO_CONSIDER_RECENT} days (checked  ${allMessages.length} messages total)`
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

  const unreadFileName = `${new Date().toISOString().split('T')[0]}-${UNREAD_INACTIVE_USERS_FILE_NAME}`
  fs.writeFileSync(
    unreadFileName,
    convertToCSV(
      usersWhoHaveNotReadAMessage.map(([userId, user]) => {
        return {
          'User ID': userId,
          Messages: user.messageCount,
          Groups: user.groups.join(' & '),
        }
      })
    )
  )
  log.info(
    `Inactive users who have not read a message have been written to ${unreadFileName}`
  )

  const undeliveredFileName = `${new Date().toISOString().split('T')[0]}-${UNDELIVERED_INACTIVE_USERS_FILE_NAME}`
  fs.writeFileSync(
    undeliveredFileName,
    convertToCSV(
      usersWhoHaveNotReceivedAMessage.map(([userId, user]) => {
        return {
          'User ID': userId,
          Messages: user.messageCount,
          Groups: user.groups.join(' & '),
        }
      })
    )
  )
  log.info(
    `Inactive users who have not had a message delivered have been written to ${undeliveredFileName}`
  )
}

async function removeUsers(community, participants) {
  do {
    const answers = await inquirer.prompt([
      {
        type: 'rawlist',
        name: 'action',
        message: 'Which would you like to do?',
        choices: [
          { name: 'Remove a user', value: 'remove_user' },
          { name: 'Remove several users', value: 'remove_users' },
          new inquirer.Separator(),
          { name: 'Exit', value: 'exit' },
        ],
      },
    ])

    switch (answers.action) {
      case 'remove_user':
        await promptToRemoveUser(community, participants)
        break
      case 'remove_users':
        //await findInactiveUsers(sortedChats, participants, admins)
        break
      case 'exit':
        return
      default:
        log.error('Unknown action', answers.action)
        break
    }
  } while (true) // eslint-disable-line no-constant-condition
}

async function promptToRemoveUser(community, participants) {
  const answers = await inquirer.prompt([{
    type: 'input',
    name: 'user_id',
    message: "What's the users number or uid",
  }])

  const userId = answers.user_id
  if (!userId) {
    log.error('No user ID provided, try again')
    return
  }

  await removeUser(community, participants, userId)
}

async function removeUser(community, participants, userNumberOrId) {
  let user 
  if (userNumberOrId.includes('@')) {
    user = participants.get(userNumberOrId)
  } else {
    user = Array.from(participants.values()).find((user) => user.id.user === userNumberOrId.replace('+', ''))
  }

  if (!user) {
    log.error(`User with ID or number ${userNumberOrId} found in known community participants, try again`)
    return
  }

  if (user.isAdmin || user.isSuperAdmin) {
    log.error(`Trying to remove an admin, this is not supported`)
    return
  }

  const contact = await client.getContactById(user.id._serialized)
  if (!contact) {
    log.error(`Unable to load contact matching ${user.id.number}`)
    return
  }

  if (contact.isMe) {
    log.error(`Trying to remove yourself, this is not supported`)
    return
  }

  log.info(`Going to remove ${contact.name ?? 'unknown name'} (${contact.number}) from community and ${user.groups.join(' & ')}`)
    
  const answer = await inquirer.prompt([
    {
      name: "proceed",
      type: "confirm",
      message: "Should we proceed?",
    },
  ])

  if (!answer.proceed) {
    log.info("Skipping removal of user")
    return
  }

  await community.removeParticipants([user.id._serialized])
}

async function reportUsersOnlyInOneGroup(sortedChats, participants, admins) {
  const announceGroupNames = sortedChats.filter((chat) => chat.groupMetadata.announce).map((chat) => chat.name)
  const usersOnlyInOneGroup = Array.from(participants.values()).filter((user) => user.groups.filter((groupName) => !announceGroupNames.includes(groupName)).length === 1)

  const fileName = `${new Date().toISOString().split('T')[0]}-${USERS_ONLY_IN_ONE_GROUP_FILE_NAME}`

  const usersOnlyInOneGroupCSV = usersOnlyInOneGroup.map((user) => {
    return {
      'User ID': user.id._serialized,
      Group: user.groups.filter((groupName) => !announceGroupNames.includes(groupName)).join(' & '),
    }
  })

  fs.writeFileSync(fileName, convertToCSV(usersOnlyInOneGroupCSV))
  log.info(`Users only in one group have been written to ${fileName}`)
}