import { useEffect, useRef, useState } from 'react'
import { Hash, ImagePlus, Loader2, LogOut, MessageCircle, Plus, Send, Smile, UserRound, Users, X } from 'lucide-react'
import { supabase } from './supabaseClient'

const getDefaultUsername = (email = '') => {
  return email.split('@')[0] || 'user'
}

const getFriendlyAuthMessage = (message) => {
  if (message.includes('User already registered')) {
    return 'This email is already registered. Please use Login instead.'
  }

  if (message.includes('Invalid login credentials')) {
    return 'The email or password is incorrect.'
  }

  if (message.includes('Email not confirmed')) {
    return 'Please confirm your email before logging in.'
  }

  return message
}

const getFriendlyChannelError = (message) => {
  if (message.includes("Could not find the 'user_id' column of 'channels'")) {
    return 'The channels table is missing user_id. Run supabase_channels_user_id_fix.sql in the Supabase SQL Editor, then try again.'
  }

  if (message.includes('violates foreign key constraint')) {
    return 'Channel creation failed because this user does not have a matching profile row yet. Run supabase_profiles_rls_fix.sql, log out, log in again, and try again.'
  }

  if (message.includes('row-level security policy')) {
    return 'Channel creation is blocked by the Supabase channels RLS policy. Run supabase_channels_user_id_fix.sql in the Supabase SQL Editor, then try again.'
  }

  if (message.includes('duplicate key') || message.includes('already exists')) {
    return 'A channel with this name already exists.'
  }

  return message
}

const isMissingProfileEmailColumnError = (error) => {
  return error?.message?.includes("Could not find the 'email' column of 'profiles'")
}

const getFriendlyProfileError = (message) => {
  if (message.includes('row-level security policy')) {
    return 'Profile creation is blocked by the Supabase profiles RLS policy. Run supabase_profiles_rls_fix.sql in the Supabase SQL Editor, then try again.'
  }

  return message
}

const getFriendlyMessageError = (message) => {
  if (message.includes('Bucket not found') || message.includes('bucket not found')) {
    return 'Image upload failed because the chat-images storage bucket is missing. Run supabase_chat_images_storage_fix.sql in the Supabase SQL Editor, then try again.'
  }

  if (message.includes('row-level security policy') && message.includes('storage')) {
    return 'Image upload is blocked by the Supabase Storage policy. Run supabase_chat_images_storage_fix.sql in the Supabase SQL Editor, then try again.'
  }

  if (message.includes('storage') || message.includes('Storage')) {
    return `Image upload failed: ${message}`
  }

  if (message.includes('row-level security policy')) {
    return 'Message sending is blocked by the Supabase messages RLS policy. Check the messages insert policy for authenticated users.'
  }

  if (message.includes('violates foreign key constraint')) {
    return 'Message sending failed because the selected channel or user profile does not exist in Supabase.'
  }

  return message
}

const getFriendlyImageUploadError = (message) => {
  if (message.includes('Bucket not found') || message.includes('bucket not found')) {
    return 'Image upload failed because the chat-images storage bucket is missing.'
  }

  if (message.includes('row-level security policy') || message.includes('permission')) {
    return 'Image upload is blocked by the Supabase Storage policy for chat-images.'
  }

  return `Image upload failed: ${message}`
}

const formatMessageTime = (createdAt) => {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getMessageSender = (message, currentUser) => {
  if (message.user_id === currentUser?.id) {
    return 'Me'
  }

  return (
    message.profiles?.display_name ||
    message.profiles?.username ||
    message.profiles?.email?.split('@')[0] ||
    'Unknown user'
  )
}

const mapMessage = (message, currentUser) => ({
  id: message.id,
  channelId: message.channel_id,
  sender: getMessageSender(message, currentUser),
  time: formatMessageTime(message.created_at),
  text: message.content ?? '',
  imageUrl: message.image_url ?? '',
  isMine: message.user_id === currentUser?.id,
})

const mapDirectMessage = (message, currentUser, dmUser) => ({
  id: message.id,
  sender: message.sender_id === currentUser?.id ? 'Me' : getProfileDisplayName(dmUser),
  time: formatMessageTime(message.created_at),
  text: message.content ?? '',
  imageUrl: message.image_url ?? '',
  isMine: message.sender_id === currentUser?.id,
})

const getImageExtension = (file) => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension || file.type.split('/')[1] || 'jpg'
}

const getPresenceUsers = (presenceState) => {
  const usersById = new Map()

  Object.values(presenceState).forEach((presences) => {
    presences.forEach((presence) => {
      if (!presence.user_id) {
        return
      }

      usersById.set(presence.user_id, {
        id: presence.user_id,
        email: presence.email,
        username: presence.username,
        onlineAt: presence.online_at,
      })
    })
  })

  return Array.from(usersById.values()).sort((firstUser, secondUser) => {
    const firstName = firstUser.username || firstUser.email || ''
    const secondName = secondUser.username || secondUser.email || ''
    return firstName.localeCompare(secondName)
  })
}

const getPresenceDisplayName = (presenceUser) => {
  return presenceUser.username || presenceUser.email || 'Unknown user'
}

const getProfileDisplayName = (profile) => {
  return profile.display_name || profile.username || profile.email?.split('@')[0] || 'Unknown user'
}

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authStatus, setAuthStatus] = useState('idle')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [channels, setChannels] = useState([])
  const [activeChannelId, setActiveChannelId] = useState('')
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [channelError, setChannelError] = useState('')
  const [channelCreating, setChannelCreating] = useState(false)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messageError, setMessageError] = useState('')
  const [messageSending, setMessageSending] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [profiles, setProfiles] = useState([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [profilesError, setProfilesError] = useState('')
  const [selectedDmUser, setSelectedDmUser] = useState(null)
  const [activeChatMode, setActiveChatMode] = useState('channel')
  const [dmPickerOpen, setDmPickerOpen] = useState(false)
  const latestMessagesChannelIdRef = useRef('')
  const latestDirectMessagePairRef = useRef('')

  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? channels[0] ?? null
  const isDmMode = activeChatMode === 'dm' && selectedDmUser

  const fetchProfiles = async (currentUserId) => {
    if (!supabase || !currentUserId) {
      setProfiles([])
      return
    }

    setProfilesLoading(true)
    setProfilesError('')

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username, display_name, avatar_url')
      .neq('id', currentUserId)
      .order('username', { ascending: true })

    setProfilesLoading(false)

    if (error) {
      console.error('Profiles load failed:', error)
      setProfiles([])
      setProfilesError(`Failed to load users: ${error.message}`)
      return
    }

    setProfiles(data ?? [])
  }

  const handleToggleDmPicker = async () => {
    setDmPickerOpen((isOpen) => !isOpen)

    if (!dmPickerOpen && user?.id) {
      await fetchProfiles(user.id)
    }
  }

  const fetchChannels = async (preferredChannelId = '') => {
    if (!supabase) {
      setChannelsError('Supabase environment variables are not configured.')
      return
    }

    setChannelsLoading(true)
    setChannelsError('')

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false })

    setChannelsLoading(false)

    if (error) {
      setChannels([])
      setActiveChannelId('')
      setChannelsError(`Failed to load channels: ${error.message}`)
      return
    }

    const nextChannels = data ?? []

    setChannels(nextChannels)

    if (nextChannels.length === 0) {
      setActiveChannelId('')
      return
    }

    setActiveChannelId((currentChannelId) => {
      if (preferredChannelId && nextChannels.some((channel) => channel.id === preferredChannelId)) {
        return preferredChannelId
      }

      const currentChannelExists = nextChannels.some((channel) => channel.id === currentChannelId)
      return currentChannelExists ? currentChannelId : nextChannels[0].id
    })
  }

  const fetchMessages = async (channelId) => {
    latestMessagesChannelIdRef.current = channelId

    if (!supabase || !channelId) {
      setMessages([])
      setMessagesLoading(false)
      return
    }

    setMessagesLoading(true)
    setMessageError('')
    setMessages([])

    const { data, error } = await supabase
      .from('messages')
      .select('id, channel_id, user_id, content, image_url, created_at, profiles(username, display_name, email)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })

    if (latestMessagesChannelIdRef.current !== channelId) {
      return
    }

    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('messages')
        .select('id, channel_id, user_id, content, image_url, created_at')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })

      if (latestMessagesChannelIdRef.current !== channelId) {
        return
      }

      setMessagesLoading(false)

      if (fallbackError) {
        setMessages([])
        setMessageError(`Messages load failed: ${fallbackError.message}`)
        return
      }

      setMessages((fallbackData ?? []).map((message) => mapMessage(message, user)))
      return
    }

    setMessages((data ?? []).map((message) => mapMessage(message, user)))
    setMessagesLoading(false)
  }

  const fetchDirectMessages = async (dmUser) => {
    if (!supabase || !user?.id || !dmUser?.id) {
      setMessages([])
      setMessagesLoading(false)
      return
    }

    latestDirectMessagePairRef.current = [user.id, dmUser.id].sort().join(':')
    setMessagesLoading(true)
    setMessageError('')
    setMessages([])

    const { data, error } = await supabase
      .from('direct_messages')
      .select('id, sender_id, receiver_id, content, image_url, created_at')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${dmUser.id}),and(sender_id.eq.${dmUser.id},receiver_id.eq.${user.id})`,
      )
      .order('created_at', { ascending: true })

    setMessagesLoading(false)

    if (error) {
      setMessages([])
      setMessageError(`DM messages load failed: ${error.message}`)
      return
    }

    setMessages((data ?? []).map((message) => mapDirectMessage(message, user, dmUser)))
  }

  const isDirectMessageForActiveConversation = (message, currentUserId, dmUserId) => {
    return (
      (message.sender_id === currentUserId && message.receiver_id === dmUserId) ||
      (message.sender_id === dmUserId && message.receiver_id === currentUserId)
    )
  }

  const appendDirectMessage = (message, dmUser) => {
    setMessages((currentMessages) => {
      const messageExists = currentMessages.some((currentMessage) => currentMessage.id === message.id)

      if (messageExists) {
        return currentMessages
      }

      return [...currentMessages, mapDirectMessage(message, user, dmUser)]
    })
  }

  const appendMessage = (message) => {
    setMessages((currentMessages) => {
      if (message.channelId !== activeChannelId) {
        return currentMessages
      }

      const messageExists = currentMessages.some((currentMessage) => currentMessage.id === message.id)

      if (messageExists) {
        return currentMessages
      }

      return [...currentMessages, message]
    })
  }

  const fetchMessage = async (messageId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, channel_id, user_id, content, image_url, created_at, profiles(username, display_name, email)')
      .eq('id', messageId)
      .maybeSingle()

    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('messages')
        .select('id, channel_id, user_id, content, image_url, created_at')
        .eq('id', messageId)
        .maybeSingle()

      if (fallbackError || !fallbackData) {
        return null
      }

      return mapMessage(fallbackData, user)
    }

    return data ? mapMessage(data, user) : null
  }

  const ensureUserProfile = async (authUser) => {
    if (!supabase || !authUser?.id || !authUser?.email) {
      return
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('Session lookup failed:', sessionError.message)
      return false
    }

    if (session?.user?.id !== authUser.id) {
      return false
    }

    const { data: existingProfile, error: selectError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle()

    if (selectError) {
      console.error('Profile lookup failed:', selectError.message)
      return
    }

    if (existingProfile) {
      return true
    }

    const profilePayload = {
      id: authUser.id,
      email: authUser.email,
      username: getDefaultUsername(authUser.email),
      avatar_url: null,
    }

    const insertProfile = async (payload) => {
      const { error } = await supabase.from('profiles').insert(payload)
      return error
    }

    let insertError = await insertProfile(profilePayload)

    if (isMissingProfileEmailColumnError(insertError)) {
      const { email: _email, ...profilePayloadWithoutEmail } = profilePayload
      insertError = await insertProfile(profilePayloadWithoutEmail)
    }

    if (insertError?.code === '23505') {
      const retryPayload = {
        ...profilePayload,
        username: `${profilePayload.username}-${authUser.id.slice(0, 8)}`,
      }

      let retryError = await insertProfile(retryPayload)

      if (isMissingProfileEmailColumnError(retryError)) {
        const { email: _email, ...retryPayloadWithoutEmail } = retryPayload
        retryError = await insertProfile(retryPayloadWithoutEmail)
      }

      if (retryError) {
        console.error('Profile creation failed:', getFriendlyProfileError(retryError.message))
        return false
      }

      return true
    }

    if (insertError) {
      console.error('Profile creation failed:', getFriendlyProfileError(insertError.message))
      return false
    }

    return true
  }

  const handleSessionUser = (authUser) => {
    setUser(authUser)

    if (authUser) {
      ensureUserProfile(authUser)
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return undefined
    }

    supabase.auth.getSession().then(({ data }) => {
      handleSessionUser(data.session?.user ?? null)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user) {
      const loadChannels = async () => {
        await ensureUserProfile(user)
        await fetchChannels()
        await fetchProfiles(user.id)
      }

      loadChannels()
      return
    }

    setChannels([])
    setActiveChannelId('')
    setMessages([])
    setProfiles([])
    setSelectedDmUser(null)
    setActiveChatMode('channel')
  }, [user])

  useEffect(() => {
    if (!activeChannelId) {
      latestMessagesChannelIdRef.current = ''
      setMessages([])
      setMessagesLoading(false)
      setOnlineUsers([])
      return
    }

    if (activeChatMode !== 'channel') {
      return
    }

    fetchMessages(activeChannelId)
  }, [activeChannelId, user?.id, activeChatMode])

  useEffect(() => {
    if (!isDmMode) {
      latestDirectMessagePairRef.current = ''
      return
    }

    fetchDirectMessages(selectedDmUser)
  }, [selectedDmUser?.id, activeChatMode, user?.id])

  useEffect(() => {
    if (!supabase || !isDmMode || !user?.id || !selectedDmUser?.id) {
      return undefined
    }

    const currentUserId = user.id
    const dmUser = selectedDmUser
    const conversationKey = [currentUserId, dmUser.id].sort().join(':')
    const directMessagesChannel = supabase
      .channel(`direct-messages:${conversationKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => {
          if (latestDirectMessagePairRef.current !== conversationKey) {
            return
          }

          if (!isDirectMessageForActiveConversation(payload.new, currentUserId, dmUser.id)) {
            return
          }

          appendDirectMessage(payload.new, dmUser)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(directMessagesChannel)
    }
  }, [isDmMode, selectedDmUser?.id, user?.id])

  useEffect(() => {
    if (!supabase || !activeChannelId || !user?.id || activeChatMode !== 'channel') {
      setOnlineUsers([])
      return undefined
    }

    let isSubscribed = true
    const channelId = activeChannelId
    const presenceChannel = supabase.channel(`presence:${channelId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    })

    const getCurrentUserPresence = async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, email')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Presence profile lookup failed:', error)
      }

      return {
        user_id: user.id,
        email: profile?.email || user.email,
        username: profile?.username || getDefaultUsername(user.email),
        online_at: new Date().toISOString(),
      }
    }

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        if (!isSubscribed) {
          return
        }

        setOnlineUsers(getPresenceUsers(presenceChannel.presenceState()))
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || !isSubscribed) {
          return
        }

        const presencePayload = await getCurrentUserPresence()
        await presenceChannel.track(presencePayload)
      })

    return () => {
      isSubscribed = false
      setOnlineUsers([])
      supabase.removeChannel(presenceChannel)
    }
  }, [activeChannelId, user?.id, user?.email, activeChatMode])

  useEffect(() => {
    if (!supabase || !activeChannelId || activeChatMode !== 'channel') {
      return undefined
    }

    const channelId = activeChannelId
    const messagesChannel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          if (latestMessagesChannelIdRef.current !== channelId) {
            return
          }

          const nextMessage = await fetchMessage(payload.new.id)

          if (!nextMessage || latestMessagesChannelIdRef.current !== channelId) {
            return
          }

          appendMessage(nextMessage)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messagesChannel)
    }
  }, [activeChannelId, user?.id, activeChatMode])

  const validateAuthForm = () => {
    setAuthMessage('')

    if (!supabase) {
      setAuthMessage('Supabase environment variables are not configured.')
      setAuthStatus('error')
      return false
    }

    if (!authEmail.trim() || !authPassword) {
      setAuthMessage('Please enter both email and password.')
      setAuthStatus('error')
      return false
    }

    if (authPassword.length < 6) {
      setAuthMessage('Password must be at least 6 characters.')
      setAuthStatus('error')
      return false
    }

    return true
  }

  const handleLogin = async () => {
    if (!validateAuthForm()) {
      return
    }

    setAuthSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    })

    setAuthSubmitting(false)

    if (error) {
      setAuthMessage(getFriendlyAuthMessage(error.message))
      setAuthStatus('error')
      return
    }

    setAuthStatus('success')
  }

  const handleSignUp = async () => {
    if (!validateAuthForm()) {
      return
    }

    setAuthSubmitting(true)

    const { data, error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setAuthSubmitting(false)

    if (error) {
      setAuthMessage(getFriendlyAuthMessage(error.message))
      setAuthStatus('error')
      return
    }

    if (data.session?.user) {
      await ensureUserProfile(data.user)
    }

    if (data.session) {
      setAuthMessage('Signup complete.')
    } else {
      setAuthMessage('Signup complete. Check your email if confirmation is enabled.')
    }

    setAuthStatus('success')
  }

  const handleLogout = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
  }

  const handleCreateChannel = async (event) => {
    event.preventDefault()

    const trimmedName = newChannelName.trim()

    if (!trimmedName) {
      setChannelError('Please enter a channel name.')
      return
    }

    if (!supabase) {
      setChannelError('Supabase environment variables are not configured.')
      return
    }

    const duplicateChannel = channels.some(
      (channel) => channel.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )

    if (duplicateChannel) {
      setChannelError('A channel with this name already exists.')
      return
    }

    setChannelCreating(true)
    setChannelError('')

    await ensureUserProfile(user)

    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: trimmedName,
        description: 'Newly created channel',
        user_id: user.id,
      })
      .select('id, name, description, created_at')
      .single()

    if (error) {
      setChannelCreating(false)
      setChannelError(getFriendlyChannelError(error.message))
      return
    }

    setNewChannelName('')
    setChannelError('')
    await fetchChannels(data.id)
    setChannelCreating(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmedMessage = messageText.trim()

    if ((!trimmedMessage && !selectedImage) || (!activeChannel && !isDmMode)) {
      return
    }

    if (!supabase) {
      setMessageError('Supabase environment variables are not configured.')
      return
    }

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error('Current user lookup failed:', userError)
      setMessageError('Could not verify the current user. Please log in again.')
      return
    }

    if (!currentUser?.id) {
      setMessageError('Please log in before sending a message.')
      return
    }

    setMessageSending(true)
    setMessageError('')

    await ensureUserProfile(currentUser)

    let imageUrl = ''

    if (selectedImage) {
      if (!selectedImage.type.startsWith('image/')) {
        setMessageSending(false)
        setMessageError('Please choose an image file.')
        return
      }

      const chatTargetId = isDmMode ? `dm-${selectedDmUser.id}` : activeChannel.id
      const imagePath = `${currentUser.id}/${chatTargetId}/${crypto.randomUUID()}.${getImageExtension(selectedImage)}`
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(imagePath, selectedImage, {
          cacheControl: '3600',
          contentType: selectedImage.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        console.error('Image upload failed:', {
          bucket: 'chat-images',
          path: imagePath,
          statusCode: uploadError.statusCode,
          error: uploadError.error,
          message: uploadError.message,
          details: uploadError,
        })
        setMessageSending(false)
        setMessageError(getFriendlyImageUploadError(uploadError.message))
        return
      }

      const { data: publicUrlData } = supabase.storage.from('chat-images').getPublicUrl(imagePath)
      imageUrl = publicUrlData.publicUrl
    }

    const { error } = isDmMode
      ? await supabase.from('direct_messages').insert({
          sender_id: currentUser.id,
          receiver_id: selectedDmUser.id,
          content: trimmedMessage || null,
          image_url: imageUrl || null,
        })
      : await supabase.from('messages').insert({
          channel_id: activeChannel.id,
          user_id: currentUser.id,
          content: trimmedMessage || null,
          image_url: imageUrl || null,
        })

    setMessageSending(false)

    if (error) {
      console.error('Message insert failed:', {
        table: isDmMode ? 'direct_messages' : 'messages',
        channelId: activeChannel?.id,
        receiverId: selectedDmUser?.id,
        userId: currentUser.id,
        hasContent: Boolean(trimmedMessage),
        hasImageUrl: Boolean(imageUrl),
        message: error.message,
        details: error,
      })
      setMessageError(`Message send failed: ${getFriendlyMessageError(error.message)}`)
      return
    }

    setMessageText('')
    setSelectedImage(null)

    if (isDmMode) {
      await fetchDirectMessages(selectedDmUser)
      return
    }

    await fetchMessages(activeChannel.id)
  }

  if (authLoading) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-mark">
              <MessageCircle size={22} />
            </div>
            <div>
              <h1>ChatSquare</h1>
              <p>Checking session...</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-label="Authentication">
          <div className="brand auth-brand">
            <div className="brand-mark">
              <MessageCircle size={22} />
            </div>
            <div>
              <h1>ChatSquare</h1>
              <p>Sign in to continue chatting</p>
            </div>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleLogin()
            }}
          >
            <label htmlFor="auth-email">Email</label>
            <input
              autoComplete="email"
              id="auth-email"
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={authEmail}
            />

            <label htmlFor="auth-password">Password</label>
            <input
              autoComplete="current-password"
              id="auth-password"
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Enter your password"
              type="password"
              value={authPassword}
            />

            {authMessage && <p className={`auth-message ${authStatus}`}>{authMessage}</p>}

            <div className="auth-actions">
              <button className="auth-primary-button" disabled={authSubmitting} type="submit">
                {authSubmitting ? 'Loading...' : 'Login'}
              </button>
              <button
                className="auth-secondary-button"
                disabled={authSubmitting}
                onClick={handleSignUp}
                type="button"
              >
                Sign up
              </button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <MessageCircle size={22} />
          </div>
          <div>
            <h1>ChatSquare</h1>
            <p>Realtime community chat</p>
          </div>
        </div>

        <div className="session-area">
          <button className="dm-toggle-button" onClick={handleToggleDmPicker} type="button">
            <MessageCircle size={17} />
            DM
          </button>
          <div className="room-status">
            <Users size={18} />
            <span>{user.email}</span>
          </div>
          <button className="logout-button" onClick={handleLogout} type="button">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      {dmPickerOpen && (
        <div className="dm-picker dm-picker-floating" aria-label="Direct message users">
          <div className="dm-picker-header">
            <strong>Direct Messages</strong>
            <button aria-label="Close DM list" onClick={() => setDmPickerOpen(false)} type="button">
              <X size={16} />
            </button>
          </div>

          <div className="dm-picker-list">
            {profilesLoading && (
              <div className="user-state">
                <Loader2 size={15} />
                Loading users...
              </div>
            )}
            {!profilesLoading && profilesError && <div className="user-state error">{profilesError}</div>}
            {!profilesLoading && !profilesError && profiles.length === 0 && (
              <div className="user-state stacked">
                <span>No other profiles yet.</span>
                <small>Run supabase_dm_profiles_fix.sql, then refresh.</small>
                <button onClick={() => fetchProfiles(user.id)} type="button">
                  Refresh
                </button>
              </div>
            )}
            {!profilesLoading &&
              !profilesError &&
              profiles.map((profile) => (
                <button
                  className={`dm-user-item ${selectedDmUser?.id === profile.id ? 'active' : ''}`}
                  key={profile.id}
                  onClick={() => {
                    setSelectedDmUser(profile)
                    setActiveChatMode('dm')
                    setMessages([])
                    setMessageError('')
                    setSelectedImage(null)
                    setMessageText('')
                    setDmPickerOpen(false)
                  }}
                  type="button"
                >
                  <span className="dm-avatar">{getProfileDisplayName(profile).slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{getProfileDisplayName(profile)}</strong>
                    <small>{profile.email || 'No email'}</small>
                  </span>
                  <span className="dm-message-button">
                    <MessageCircle size={14} />
                    Message
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Channels</h2>
            <span>{channels.length}</span>
          </div>

          <form className="channel-create-form" onSubmit={handleCreateChannel}>
            <label htmlFor="channel-name">Create channel</label>
            <div className="channel-create-row">
              <input
                aria-describedby={channelError ? 'channel-error' : undefined}
                aria-invalid={channelError ? 'true' : 'false'}
                id="channel-name"
                onChange={(event) => {
                  setNewChannelName(event.target.value)
                  if (channelError) {
                    setChannelError('')
                  }
                }}
                placeholder="Channel name"
                type="text"
                value={newChannelName}
              />
              <button aria-label="Create channel" disabled={channelCreating} type="submit">
                {channelCreating ? <Loader2 size={18} /> : <Plus size={18} />}
              </button>
            </div>
            {channelError && (
              <p className="channel-error" id="channel-error">
                {channelError}
              </p>
            )}
          </form>

          <nav className="channel-list" aria-label="Chat channels">
            {channelsLoading && (
              <div className="channel-state">
                <Loader2 size={17} />
                Loading channels...
              </div>
            )}

            {!channelsLoading && channelsError && (
              <div className="channel-state error">{channelsError}</div>
            )}

            {!channelsLoading && !channelsError && channels.length === 0 && (
              <div className="channel-state">No channels yet. Create the first one.</div>
            )}

            {!channelsLoading &&
              !channelsError &&
              channels.map((channel) => (
                <button
                  aria-current={channel.id === activeChannel?.id ? 'page' : undefined}
                  className={`channel-item ${channel.id === activeChannel?.id ? 'active' : ''}`}
                  key={channel.id}
                  onClick={() => {
                    setActiveChannelId(channel.id)
                    setActiveChatMode('channel')
                    setSelectedDmUser(null)
                  }}
                  type="button"
                >
                  <Hash size={17} />
                  <span>
                    <strong>{channel.name}</strong>
                    <small>{channel.description || 'No description'}</small>
                  </span>
                </button>
              ))}
          </nav>
        </aside>

        <section className={`chat-panel ${isDmMode ? 'dm-panel' : ''}`} aria-label="Chat area">
          <div className="chat-header">
            <div>
              <h2>
                {isDmMode
                  ? `DM with ${getProfileDisplayName(selectedDmUser)}`
                  : activeChannel
                    ? `# ${activeChannel.name}`
                    : 'No channel selected'}
              </h2>
              <p>
                {isDmMode
                  ? selectedDmUser.email || selectedDmUser.username || 'Direct message'
                  : activeChannel
                    ? activeChannel.description || 'No description'
                    : 'Create a channel or check the channel loading state.'}
              </p>
            </div>
          </div>

          <div className="message-list" aria-label="Message list">
            {messagesLoading ? (
              <div className="empty-messages">
                <Loader2 size={18} />
                <strong>{isDmMode ? 'Loading DM...' : 'Loading messages...'}</strong>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-messages">
                {isDmMode && <UserRound size={20} />}
                <strong>{isDmMode ? `No DMs with ${getProfileDisplayName(selectedDmUser)} yet` : 'No messages yet'}</strong>
                <p>
                  {isDmMode
                    ? 'Start a private conversation.'
                    : activeChannel
                    ? `Start the conversation in #${activeChannel.name}.`
                    : 'Select a channel to start chatting.'}
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  className={`message-row ${message.isMine ? 'mine' : 'theirs'}`}
                  key={message.id}
                >
                  {!message.isMine && <div className="avatar">{message.sender.slice(0, 1)}</div>}

                  <div className="message-group">
                    <div className="message-meta">
                      <strong>{message.sender}</strong>
                      <time>{message.time}</time>
                    </div>
                    <div className="message-bubble">
                      {message.imageUrl && (
                        <img alt="Uploaded chat attachment" className="message-image" src={message.imageUrl} />
                      )}
                      {message.text && <p>{message.text}</p>}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          <form className="message-composer" onSubmit={handleSubmit}>
            {selectedImage && (
              <div className="image-attachment">
                <span>{selectedImage.name}</span>
                <button
                  aria-label="Remove selected image"
                  disabled={messageSending}
                  onClick={() => setSelectedImage(null)}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="composer-row">
              <label className="icon-button" aria-label="Attach image" htmlFor="message-image">
                <ImagePlus size={20} />
              </label>
              <input
                className="hidden-file-input"
                disabled={messageSending || (!activeChannel && !isDmMode)}
                id="message-image"
                onChange={(event) => {
                  setSelectedImage(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
                type="file"
                accept="image/*"
              />
              <button className="icon-button" type="button" aria-label="Add emoji">
                <Smile size={20} />
              </button>
              <input
                aria-label="Message input"
                disabled={messageSending || (!activeChannel && !isDmMode)}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={
                  isDmMode
                    ? `Message ${getProfileDisplayName(selectedDmUser)}`
                    : activeChannel
                      ? `Message #${activeChannel.name}`
                      : 'Select a channel'
                }
                type="text"
                value={messageText}
              />
              <button
                className="send-button"
                disabled={(!messageText.trim() && !selectedImage) || (!activeChannel && !isDmMode) || messageSending}
                type="submit"
              >
                {messageSending ? <Loader2 className="button-spinner" size={18} /> : <Send size={18} />}
                {messageSending ? 'Uploading' : 'Send'}
              </button>
            </div>
          </form>
          {messageError && <p className="message-error">{messageError}</p>}
        </section>

        <aside className="user-panel">
          <h2>Direct Messages</h2>
          <div className="user-list dm-user-list">
            {profilesLoading && (
              <div className="user-state">
                <Loader2 size={15} />
                Loading users...
              </div>
            )}
            {!profilesLoading && profilesError && <div className="user-state error">{profilesError}</div>}
            {!profilesLoading && !profilesError && profiles.length === 0 && (
              <div className="user-state stacked">
                <span>No other profiles yet.</span>
                <small>Run supabase_dm_profiles_fix.sql, then refresh.</small>
                <button onClick={() => fetchProfiles(user.id)} type="button">
                  Refresh
                </button>
              </div>
            )}
            {!profilesLoading &&
              !profilesError &&
              profiles.map((profile) => (
                <button
                  className={`dm-user-item ${selectedDmUser?.id === profile.id ? 'active' : ''}`}
                  key={profile.id}
                  onClick={() => {
                    setSelectedDmUser(profile)
                    setActiveChatMode('dm')
                    setMessages([])
                    setMessageError('')
                    setSelectedImage(null)
                    setMessageText('')
                  }}
                  type="button"
                >
                  <span className="dm-avatar">{getProfileDisplayName(profile).slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{getProfileDisplayName(profile)}</strong>
                    <small>{profile.email || 'No email'}</small>
                  </span>
                  <span className="dm-message-button">
                    <MessageCircle size={14} />
                    Message
                  </span>
                </button>
              ))}
          </div>

          <div className="panel-divider" />

          <h2>{activeChannel && activeChatMode === 'channel' ? `Online in #${activeChannel.name}` : 'Channel Online'}</h2>
          <div className="user-list">
            {activeChatMode !== 'channel' && <div className="user-state">Open a channel to see presence</div>}
            {activeChatMode === 'channel' && !activeChannel && <div className="user-state">Select a channel</div>}
            {activeChatMode === 'channel' && activeChannel && onlineUsers.length === 0 && (
              <div className="user-state">No users online</div>
            )}
            {activeChatMode === 'channel' &&
              activeChannel &&
              onlineUsers.map((onlineUser) => (
                <div className="user-item" key={onlineUser.id}>
                  <span className="presence-dot" />
                  <span>{getPresenceDisplayName(onlineUser)}</span>
                </div>
              ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
