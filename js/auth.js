/* ============================================
   bizfriend - Authentication
   ============================================ */

(function () {
  'use strict';

  // Pages ที่ไม่ต้อง login
  var publicPages = ['login.html', 'register.html'];

  // ===== Auth State Check =====
  async function checkAuth() {
    var currentPage = window.location.pathname.split('/').pop() || 'network.html';
    var isPublicPage = publicPages.indexOf(currentPage) !== -1;

    var session = await window.bizGetSession();

    if (!session && !isPublicPage) {
      window.location.href = 'login.html';
      return null;
    }

    if (session && isPublicPage) {
      window.location.href = 'network.html';
      return null;
    }

    if (session) {
      var profile = await window.bizGetProfile(session.user.id);
      if (profile) {
        syncProfileFromProvider(session.user, profile);
        updateUserUI(session.user, profile);
      }
    }

    return session;
  }

  // ===== Sync profile from OAuth provider metadata =====
  async function syncProfileFromProvider(user, profile) {
    var meta = user.user_metadata || {};
    var providerName = meta.full_name || meta.name || meta.display_name || '';
    var providerAvatar = meta.avatar_url || meta.picture || '';

    if (!providerName && !providerAvatar) return;
    if (!profile) return;

    var updates = {};
    if (providerName && !profile.display_name) {
      updates.display_name = providerName;
    }
    if (providerAvatar && !profile.avatar_url) {
      updates.avatar_url = providerAvatar;
    }

    if (Object.keys(updates).length === 0) return;

    await supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
  }

  // ===== Update UI with user info =====
  function updateUserUI(user, profile) {
    if (!profile) return;

    var name = (profile.display_name || user.email.split('@')[0]).split(' ')[0];
    var initial = name.charAt(0);
    var style = window.bizAvatarStyle(user.id);

    document.querySelectorAll('.user-avatar-initial').forEach(function (el) {
      if (profile.avatar_url) {
        el.innerHTML = '<img src="' + profile.avatar_url + '" class="w-full h-full object-cover rounded-full" alt="">';
        el.style.background = '';
        el.style.color = '';
      } else {
        el.textContent = initial;
        el.style.background = style.bg;
        el.style.color = style.fg;
      }
    });

    document.querySelectorAll('.user-display-name').forEach(function (el) {
      el.textContent = name;
    });
  }

  // ===== Register =====
  async function register(email, password, displayName) {
    var { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { display_name: displayName }
      }
    });

    if (error) return { error: window.bizErr(error) };
    return { data: data };
  }

  // ===== Login =====
  async function login(email, password) {
    var { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) return { error: window.bizErr(error) };
    return { data: data };
  }

  // ===== Login with Google =====
  async function loginWithGoogle() {
    var { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/network.html'
      }
    });
    if (error) return { error: window.bizErr(error) };
    return { data: true };
  }

  // ===== Logout =====
  async function logout() {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      // sign out อาจ error ได้ ไม่เป็นไร redirect ต่อ
    }
    window.location.href = 'login.html';
  }

  // ===== Listen for auth changes =====
  // Guard: อย่า redirect ถ้าอยู่ใน public page อยู่แล้ว (กัน infinite loop เมื่อ
  // SIGNED_OUT fire ซ้ำตอน token corrupt/expired)
  supabaseClient.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') {
      var current = window.location.pathname.split('/').pop() || 'index.html';
      var publicOrIndex = ['login.html', 'register.html', 'index.html', ''];
      if (publicOrIndex.indexOf(current) === -1) {
        window.location.href = 'login.html';
      }
    }
  });

  // ===== Expose globally =====
  window.bizAuth = {
    checkAuth: checkAuth,
    register: register,
    login: login,
    loginWithGoogle: loginWithGoogle,
    logout: logout
  };

  // ===== Auto-check on page load =====
  document.addEventListener('DOMContentLoaded', function () {
    checkAuth();

    // Logout buttons
    document.querySelectorAll('[data-action="logout"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        logout();
      });
    });
  });
})();
