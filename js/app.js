/* ============================================
   bizfriend - App JavaScript
   Minimal JS: panic button, stealth blur, nav
   ============================================ */

// Global: อัปเดต badge จำนวนข้อความที่ยังไม่ได้อ่านบน nav items
// รับ total (int) หรือ undefined → จะไป query เอง
window.bizUpdateUnreadBadge = async function (total) {
  if (typeof total !== 'number') {
    try {
      var session = await window.bizGetSession();
      if (!session) return;
      var { data, error } = await supabaseClient.rpc('get_my_conversations');
      if (error) { console.warn('unread badge rpc error', error); return; }
      total = (data || []).reduce(function (sum, c) {
        return sum + (c.unread_count || 0);
      }, 0);
    } catch (e) {
      console.warn('unread badge error', e);
      return;
    }
  }
  document.querySelectorAll('[data-unread-badge]').forEach(function (el) {
    if (total > 0) {
      el.textContent = total > 99 ? '99+' : String(total);
      el.style.display = 'flex'; // override 'hidden' จาก Tailwind
      el.classList.remove('hidden');
    } else {
      el.style.display = 'none';
      el.classList.add('hidden');
    }
  });
};

// Watch unread count — hybrid approach:
// 1) Polling ทุก 20 วินาที (reliable safety net)
// 2) Realtime subscription (instant bonus ถ้าทำงาน)
// 3) Refresh ทันทีเมื่อ tab กลับมา visible
var _unreadBadgeChannel = null;
var _unreadPollInterval = null;
var _unreadVisibilityHooked = false;

window.bizWatchUnreadBadge = async function () {
  var session = await window.bizGetSession();
  if (!session) return;
  var myId = session.user.id;

  // รีเฟรช badge ทันที
  window.bizUpdateUnreadBadge();

  // ===== Polling =====
  if (!_unreadPollInterval) {
    _unreadPollInterval = setInterval(function () {
      if (document.visibilityState === 'visible') {
        window.bizUpdateUnreadBadge();
      }
    }, 20000); // 20 วินาที
  }

  // Refresh ทันทีเมื่อ tab กลับมา (เช่น switch tab กลับมา)
  if (!_unreadVisibilityHooked) {
    _unreadVisibilityHooked = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        window.bizUpdateUnreadBadge();
      }
    });
  }

  // ===== Realtime (bonus — ถ้าทำงานจะ instant) =====
  if (_unreadBadgeChannel) return;
  _unreadBadgeChannel = supabaseClient
    .channel('unread-badge-' + myId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, function (payload) {
      if (payload.new && payload.new.sender_id !== myId) {
        window.bizUpdateUnreadBadge();
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
    }, function () {
      window.bizUpdateUnreadBadge();
    })
    .subscribe();
};

// เมื่อ auth state เปลี่ยน → re-check (ไม่รวม INITIAL_SESSION เพราะ DOMContentLoaded ทำแล้ว)
supabaseClient.auth.onAuthStateChange(function (event, session) {
  if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
    window.bizWatchUnreadBadge();
    window.bizSetupPresence();
  }
});

// ============================================
// Online Presence (Supabase Realtime Presence)
// ============================================
// ephemeral — user online = มี tab เปิดอยู่, offline = tab ปิด / session หลุด
// ไม่ต้องแก้ schema. Subscribers ได้ list users online ครบทุก sync event.
// UI อื่นฟัง 'biz:presence-changed' แล้ว re-render dot ตามต้องการ
var _bizOnlineUsers = new Set();
var _bizPresenceChannel = null;

window.bizIsOnline = function (userId) {
  return _bizOnlineUsers.has(userId);
};

// Sync "online" dot บน element ที่ติด data-presence-user="<user_id>"
//   (optional: data-presence-size="w-3 h-3" ปรับขนาด, default w-2.5 h-2.5)
// Element นี้ต้องมี position:relative เพื่อให้ dot absolute-position ถูก
window.bizSyncPresenceDots = function () {
  document.querySelectorAll('[data-presence-user]').forEach(function (el) {
    var userId = el.getAttribute('data-presence-user');
    var size = el.getAttribute('data-presence-size') || 'w-2.5 h-2.5';
    var existing = el.querySelector('[data-presence-dot]');
    var online = _bizOnlineUsers.has(userId);
    if (online && !existing) {
      el.insertAdjacentHTML('beforeend',
        '<span data-presence-dot class="absolute bottom-0 right-0 ' + size +
        ' bg-green-500 border-2 border-white rounded-full pointer-events-none" title="ออนไลน์"></span>');
    } else if (!online && existing) {
      existing.remove();
    }
  });
};

// Auto-sync เมื่อ presence เปลี่ยน + หลัง DOM updates ทั่วไป
document.addEventListener('biz:presence-changed', window.bizSyncPresenceDots);

window.bizSetupPresence = async function () {
  if (_bizPresenceChannel) return;
  var session = await window.bizGetSession();
  if (!session) return;
  var myId = session.user.id;

  _bizPresenceChannel = supabaseClient
    .channel('online-users', { config: { presence: { key: myId } } })
    .on('presence', { event: 'sync' }, function () {
      var state = _bizPresenceChannel.presenceState();
      _bizOnlineUsers = new Set(Object.keys(state));
      document.dispatchEvent(new CustomEvent('biz:presence-changed'));
    })
    .subscribe(async function (status) {
      if (status === 'SUBSCRIBED') {
        await _bizPresenceChannel.track({ online_at: new Date().toISOString() });
      }
    });
};

// เริ่ม presence ทันทีที่หน้าโหลด (ถ้ามี session)
document.addEventListener('DOMContentLoaded', function () {
  window.bizSetupPresence();
  initThemeToggle();
});

// ============================================
// Theme Toggle (dark/light)
// ============================================
// Early-apply script ใน <head> ของทุก HTML จัดการใส่ class="dark" แล้ว
// function นี้แค่ wire ปุ่ม toggle ที่มีใน header ของหน้า authenticated
function initThemeToggle() {
  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  });
}

// 77 จังหวัดของไทย (shared — ใช้ใน network + profile)
window.BIZ_PROVINCES = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น',
  'จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร',
  'เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม',
  'นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี',
  'นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์',
  'ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง',
  'พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต',
  'มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด',
  'ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย',
  'ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม',
  'สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี',
  'สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง',
  'อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'
];

// Global utility: ให้สีพื้นหลัง avatar จาก user_id (pastel palette)
// ใช้ hex ตรงๆ ไม่ผ่าน Tailwind class เพราะ Tailwind CDN อาจไม่ generate class ที่สร้าง dynamic
window.bizAvatarStyle = function (userId) {
  var palette = [
    { bg: '#dbeafe', fg: '#1d4ed8' }, // blue
    { bg: '#fce7f3', fg: '#be185d' }, // pink
    { bg: '#fef3c7', fg: '#b45309' }, // amber
    { bg: '#ccfbf1', fg: '#0f766e' }, // teal
    { bg: '#e0e7ff', fg: '#4338ca' }, // indigo
    { bg: '#ffe4e6', fg: '#be123c' }, // rose
    { bg: '#dcfce7', fg: '#15803d' }, // green
    { bg: '#f3e8ff', fg: '#7e22ce' }, // purple
    { bg: '#fed7aa', fg: '#c2410c' }, // orange
    { bg: '#cffafe', fg: '#0e7490' }, // cyan
  ];
  var id = userId || '';
  var h = 0;
  for (var i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

(function () {
  'use strict';

  // --- Nav Active State ---
  function setActiveNav() {
    var currentPage = window.location.pathname.split('/').pop() || 'network.html';

    // Desktop sidebar nav
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(function (item) {
      var href = item.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'network.html')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Mobile bottom nav
    document.querySelectorAll('.bottom-nav .nav-item').forEach(function (item) {
      var href = item.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'network.html')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // --- Stealth Blur Toggle (event delegation — ทำงานกับ element ที่ render ทีหลังด้วย) ---
  function initStealthBlur() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('.stealth-blur');
      if (el) el.classList.toggle('revealed');
    });
  }

  // --- Global Blur Toggle ---
  function initBlurToggle() {
    // Restore saved preference
    if (localStorage.getItem('blurOff') === '1') {
      document.body.classList.add('blur-off');
    }

    document.querySelectorAll('.blur-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.body.classList.toggle('blur-off');
        var isOff = document.body.classList.contains('blur-off');
        localStorage.setItem('blurOff', isOff ? '1' : '0');
      });
    });
  }

  // --- Mobile Search Toggle ---
  function initMobileSearch() {
    var searchToggle = document.getElementById('search-toggle');
    var searchBar = document.getElementById('mobile-search');
    if (searchToggle && searchBar) {
      searchToggle.addEventListener('click', function () {
        searchBar.classList.toggle('hidden');
      });
    }
  }

  // --- User Menu Dropdown ---
  function initUserMenu() {
    document.querySelectorAll('.user-menu-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = this.nextElementSibling;
        // Close other open menus
        document.querySelectorAll('.user-menu.show').forEach(function (m) {
          if (m !== menu) m.classList.remove('show');
        });
        menu.classList.toggle('show');
      });
    });
    document.addEventListener('click', function () {
      document.querySelectorAll('.user-menu.show').forEach(function (menu) {
        menu.classList.remove('show');
      });
    });
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    setActiveNav();
    initStealthBlur();
    initBlurToggle();
    initMobileSearch();
    initUserMenu();
    // เริ่ม watcher (subscribe realtime + initial fetch)
    window.bizWatchUnreadBadge();
  });
})();
