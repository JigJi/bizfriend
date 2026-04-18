/* ============================================
   bizfriend - Chat
   ============================================ */

(function () {
  'use strict';

  var currentUserId = null;
  var currentConvId = null;
  var currentChannel = null;
  var conversationsCache = [];
  var searchQuery = '';
  var statusFilter = 'all'; // 'all' | 'unread' | 'read'
  var favoritesOnly = false;
  var myFavorites = new Set();

  // ===== Helpers =====
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }
    var diffDay = Math.floor((now - d) / 86400000);
    if (diffDay <= 1) return 'เมื่อวาน';
    if (diffDay < 7) return d.toLocaleDateString('th-TH', { weekday: 'short' });
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }

  function formatHM(ts) {
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  // ===== Load conversation list (single round trip via RPC) =====
  async function loadConversations() {
    var { data, error } = await supabaseClient.rpc('get_my_conversations');

    if (error) {
      console.error('get_my_conversations failed', error);
      renderConversationList([]);
      return;
    }

    var list = (data || []).map(function (row) {
      return {
        id: row.id,
        otherUser: {
          id: row.other_user_id,
          display_name: row.other_display_name || '',
          avatar_url: row.other_avatar_url || '',
        },
        lastMessage: row.last_message_content != null ? {
          content: row.last_message_content,
          created_at: row.last_message_at,
          sender_id: row.last_message_sender,
        } : null,
        unread: row.unread_count || 0,
      };
    });

    conversationsCache = list;
    renderConversationList(list);

    // อัปเดต nav badge จากข้อมูลสดที่เพิ่งโหลดมา
    if (window.bizUpdateUnreadBadge) {
      var total = list.reduce(function (sum, c) { return sum + (c.unread || 0); }, 0);
      window.bizUpdateUnreadBadge(total);
    }
  }

  function renderConversationList(list) {
    var container = document.getElementById('chat-list');
    if (!container) return;

    // ใช้ cache ไม่ใช่ list ที่ส่งมา (จะได้ filter ซ้ำตอน search/filter เปลี่ยน)
    var all = conversationsCache;

    // apply filter (status AND favorites AND search — independent)
    var filtered = all.filter(function (c) {
      if (statusFilter === 'unread' && !c.unread) return false;
      if (statusFilter === 'read' && c.unread) return false;
      if (favoritesOnly && !myFavorites.has(c.otherUser.id)) return false;
      if (searchQuery) {
        var name = (c.otherUser.display_name || '').toLowerCase();
        if (name.indexOf(searchQuery.toLowerCase()) === -1) return false;
      }
      return true;
    });

    if (all.length === 0) {
      container.innerHTML =
        '<div class="p-6 text-center text-sm text-slate-400">' +
        'ยังไม่มีการสนทนา<br>' +
        '<a href="network.html" class="text-primary hover:underline">เริ่มแชทจากหน้าหาเพื่อน</a>' +
        '</div>';
      return;
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="p-6 text-center text-sm text-slate-400">ไม่พบรายการ</div>';
      return;
    }

    container.innerHTML = filtered.map(function (c) {
      var name = c.otherUser.display_name || 'ไม่มีชื่อ';
      var initial = name.charAt(0) || '?';
      var preview = c.lastMessage ? c.lastMessage.content : 'เริ่มการสนทนา';
      var time = c.lastMessage ? formatTime(c.lastMessage.created_at) : '';
      var isActive = c.id === currentConvId;
      var profileHref = 'profile.html?user=' + encodeURIComponent(c.otherUser.id);
      var s = window.bizAvatarStyle(c.otherUser.id);
      var avatarInner = c.otherUser.avatar_url
        ? '<img src="' + escapeHtml(c.otherUser.avatar_url) + '" class="w-10 h-10 rounded-full object-cover flex-shrink-0">'
        : '<div class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0" style="background:' + s.bg + ';color:' + s.fg + '">' + escapeHtml(initial) + '</div>';
      return (
        '<div class="chat-list-item ' + (isActive ? 'active' : '') + '" data-conv-id="' + escapeHtml(c.id) + '">' +
          '<a href="' + profileHref + '" data-profile-link title="ดูโปรไฟล์" style="display:contents;">' + avatarInner + '</a>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center justify-between">' +
              '<a href="' + profileHref + '" data-profile-link class="text-sm font-semibold text-slate-800 truncate hover:underline" style="color:inherit;text-decoration:none;">' + escapeHtml(name) + '</a>' +
              '<span class="text-xs text-slate-400">' + escapeHtml(time) + '</span>' +
            '</div>' +
            '<p class="text-xs text-slate-500 truncate">' + escapeHtml(preview) + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('[data-conv-id]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        // ถ้าคลิกที่ avatar/ชื่อ → ปล่อย browser navigate ไปหน้าโปรไฟล์ (default behavior)
        if (e.target.closest('[data-profile-link]')) return;
        openConversation(el.dataset.convId);
      });
    });
  }

  // ===== Open conversation =====
  async function openConversation(convId) {
    currentConvId = convId;

    // mark active in list
    document.querySelectorAll('.chat-list-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.convId === convId);
    });

    // update header from cache
    var conv = conversationsCache.find(function (c) { return c.id === convId; });
    var headerName = document.getElementById('chat-header-name');
    var headerAvatar = document.getElementById('chat-header-avatar');
    if (conv) {
      var profileHref = 'profile.html?user=' + encodeURIComponent(conv.otherUser.id);
      if (headerName) {
        headerName.innerHTML = '<a href="' + profileHref + '" class="hover:underline" style="color:inherit;text-decoration:none;">' + escapeHtml(conv.otherUser.display_name || 'ไม่มีชื่อ') + '</a>';
      }
      if (headerAvatar) {
        var initial = (conv.otherUser.display_name || '?').charAt(0);
        var s = window.bizAvatarStyle(conv.otherUser.id);
        var avatarInner = conv.otherUser.avatar_url
          ? '<img src="' + escapeHtml(conv.otherUser.avatar_url) + '" class="w-9 h-9 rounded-full object-cover">'
          : '<div class="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm" style="background:' + s.bg + ';color:' + s.fg + '">' + escapeHtml(initial) + '</div>';
        headerAvatar.innerHTML = '<a href="' + profileHref + '" title="ดูโปรไฟล์">' + avatarInner + '</a>';
      }
      var menuProfile = document.getElementById('chat-menu-profile');
      if (menuProfile) menuProfile.href = profileHref;
    }

    // show chat area, hide empty state
    var chatArea = document.getElementById('chat-area');
    var emptyState = document.getElementById('chat-empty-state');
    if (chatArea) chatArea.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    // mobile: show chat panel (hide list)
    var sidebar = document.querySelector('.chat-sidebar-panel');
    if (sidebar && window.innerWidth < 1024) sidebar.classList.remove('show');

    // load messages + mark as read + subscribe (parallel)
    subscribeToConv(convId);

    var [msgsRes] = await Promise.all([
      supabaseClient
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true }),
      supabaseClient
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', convId)
        .neq('sender_id', currentUserId)
        .is('read_at', null),
    ]);

    renderMessages(msgsRes.data || []);
    scrollMessagesToBottom();
  }

  function renderMessages(msgs) {
    var container = document.getElementById('messages-container');
    if (!container) return;
    if (msgs.length === 0) {
      container.innerHTML = '<div class="text-center text-sm text-slate-400 py-8">เริ่มต้นการสนทนา 👋</div>';
      return;
    }
    container.innerHTML = msgs.map(renderMessageBubble).join('');
  }

  function renderMessageBubble(m) {
    var isMine = m.sender_id === currentUserId;
    var time = formatHM(m.created_at);
    if (isMine) {
      return (
        '<div class="flex gap-2 items-end justify-end">' +
          '<div>' +
            '<div class="chat-bubble sent">' + escapeHtml(m.content) + '</div>' +
            '<div class="text-[0.625rem] text-slate-400 mt-1 mr-1 text-right">' + time + '</div>' +
          '</div>' +
        '</div>'
      );
    }
    var conv = conversationsCache.find(function (c) { return c.id === currentConvId; });
    var initial = ((conv && conv.otherUser.display_name) || '?').charAt(0);
    return (
      '<div class="flex gap-2 items-end">' +
        '<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">' + escapeHtml(initial) + '</div>' +
        '<div>' +
          '<div class="chat-bubble received">' + escapeHtml(m.content) + '</div>' +
          '<div class="text-[0.625rem] text-slate-400 mt-1 ml-1">' + time + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function appendMessage(m) {
    var container = document.getElementById('messages-container');
    if (!container) return;
    // ลบ empty state ถ้ามี
    var empty = container.querySelector('.text-center');
    if (empty) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', renderMessageBubble(m));
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    var container = document.getElementById('messages-container');
    if (container) container.scrollTop = container.scrollHeight;
  }

  // ===== Send message =====
  // Optimistic: append ทันทีหลัง INSERT สำเร็จ (ไม่รอ realtime)
  // กัน dupe โดย skip ข้อความของตัวเองใน realtime handler
  async function sendMessage(content) {
    if (!currentConvId) return;
    var text = (content || '').trim();
    if (!text) return;

    var { data, error } = await supabaseClient
      .from('messages')
      .insert({
        conversation_id: currentConvId,
        sender_id: currentUserId,
        content: text,
        type: 'text',
      })
      .select()
      .single();

    if (error) {
      console.error('send failed', error);
      alert('ส่งข้อความไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }

    if (data) {
      appendMessage(data);
      loadConversations(); // refresh last-message preview ใน list
    }
  }

  // ===== Realtime =====
  // ฟัง INSERT ของ messages ใน conv ปัจจุบัน (เฉพาะของอีกฝ่าย)
  function subscribeToConv(convId) {
    if (currentChannel) {
      supabaseClient.removeChannel(currentChannel);
      currentChannel = null;
    }
    currentChannel = supabaseClient
      .channel('messages-' + convId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.' + convId,
      }, function (payload) {
        // skip ของตัวเอง เพราะ append ไปแล้วจาก sendMessage
        if (payload.new.sender_id === currentUserId) return;
        appendMessage(payload.new);
        loadConversations();
      })
      .subscribe();
  }

  // ===== Find or create DM (1-on-1) =====
  // ใช้ RPC create_direct_conversation (SECURITY DEFINER) เพื่อหลีกเลี่ยงปัญหา
  // RLS chicken-and-egg ตอน .select() หลัง .insert() บน conversations
  async function findOrCreateDM(otherUserId) {
    if (!otherUserId || otherUserId === currentUserId) return null;

    var { data, error } = await supabaseClient.rpc('create_direct_conversation', {
      other_user_id: otherUserId,
    });

    if (error) {
      console.error('create_direct_conversation failed', error);
      alert('สร้างการสนทนาไม่สำเร็จ: ' + window.bizErr(error));
      return null;
    }

    return data;
  }

  // ===== Load my favorites =====
  async function loadFavorites() {
    var { data } = await supabaseClient
      .from('favorites')
      .select('favorited_user_id')
      .eq('user_id', currentUserId);
    myFavorites = new Set((data || []).map(function (r) { return r.favorited_user_id; }));
  }

  // ===== Init =====
  async function init() {
    var { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; // auth.js จะ redirect ไป login
    currentUserId = session.user.id;
    loadFavorites(); // fire and forget — filter ทำงานหลังโหลดเสร็จ

    // wire search input
    var searchInput = document.getElementById('chat-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = searchInput.value.trim();
        renderConversationList(conversationsCache);
      });
    }

    // wire send (sync, ไม่รอ network)
    var sendBtn = document.getElementById('chat-send-btn');
    var input = document.getElementById('chat-input');
    if (sendBtn && input) {
      sendBtn.addEventListener('click', function () {
        var v = input.value;
        input.value = '';
        sendMessage(v);
        input.focus();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }

    // ?with=<user_id> → สร้าง DM + โหลด list parallel (ประหยัด 1 round trip)
    var params = new URLSearchParams(window.location.search);
    var withUserId = params.get('with');

    if (withUserId) {
      var [convId] = await Promise.all([
        findOrCreateDM(withUserId),
        loadConversations(),
      ]);
      if (convId) {
        if (!conversationsCache.find(function (c) { return c.id === convId; })) {
          await loadConversations();
        }
        await openConversation(convId);
        history.replaceState(null, '', 'chat.html');
      }
    } else {
      await loadConversations();
      if (conversationsCache.length > 0) {
        await openConversation(conversationsCache[0].id);
      }
    }
  }

  // ===== Status dropdown =====
  var STATUS_LABELS = { all: 'ทั้งหมด', unread: 'ยังไม่ได้อ่าน', read: 'อ่านแล้ว' };

  function toggleStatusMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('chat-status-menu');
    if (menu) menu.classList.toggle('hidden');
  }

  function closeStatusMenu() {
    var menu = document.getElementById('chat-status-menu');
    if (menu) menu.classList.add('hidden');
  }

  function setStatus(s) {
    statusFilter = s;
    var label = document.getElementById('chat-status-label');
    if (label) label.textContent = STATUS_LABELS[s] || s;
    closeStatusMenu();
    renderConversationList(conversationsCache);
  }

  // ===== Favorites toggle =====
  function toggleFavoriteFilter() {
    favoritesOnly = !favoritesOnly;
    var btn = document.getElementById('chat-fav-btn');
    if (!btn) return;
    if (favoritesOnly) {
      btn.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
      btn.classList.add('bg-primary', 'text-white');
    } else {
      btn.classList.remove('bg-primary', 'text-white');
      btn.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
    }
    renderConversationList(conversationsCache);
  }

  // ===== Chat header menu (3-dot) =====
  function toggleMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('chat-menu');
    if (menu) menu.classList.toggle('hidden');
  }

  function closeMenu() {
    var menu = document.getElementById('chat-menu');
    if (menu) menu.classList.add('hidden');
  }

  async function blockCurrent() {
    closeMenu();
    if (!currentConvId) return;
    var conv = conversationsCache.find(function (c) { return c.id === currentConvId; });
    if (!conv) return;

    var name = conv.otherUser.display_name || 'ผู้ใช้นี้';
    var ok = confirm('บล็อก ' + name + '? \nคุณจะไม่เห็นเขาในรายการแชท โพสต์ และเขาจะส่งข้อความหาคุณไม่ได้');
    if (!ok) return;

    var { error } = await supabaseClient.rpc('block_user', {
      target_id: conv.otherUser.id,
    });

    if (error) {
      alert('บล็อกไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }

    // ปิด realtime channel + ซ่อนหน้าแชท + reload list
    if (currentChannel) {
      supabaseClient.removeChannel(currentChannel);
      currentChannel = null;
    }
    currentConvId = null;
    var chatArea = document.getElementById('chat-area');
    var emptyState = document.getElementById('chat-empty-state');
    if (chatArea) chatArea.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');

    await loadConversations();
  }

  // click outside → close menus
  document.addEventListener('click', function (e) {
    var statusWrap = document.getElementById('chat-status-wrap');
    if (statusWrap && !statusWrap.contains(e.target)) closeStatusMenu();
    var menuWrap = document.getElementById('chat-menu-wrap');
    if (menuWrap && !menuWrap.contains(e.target)) closeMenu();
  });

  window.bizChat = {
    toggleStatusMenu: toggleStatusMenu,
    setStatus: setStatus,
    toggleFavoriteFilter: toggleFavoriteFilter,
    toggleMenu: toggleMenu,
    blockCurrent: blockCurrent,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
