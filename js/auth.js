/* ============================================
   bizfriend - Authentication
   ============================================ */

(function () {
  'use strict';

  // Pages ที่ไม่ต้อง login — รองรับทั้ง .html และ clean URL (Cloudflare Pages auto-strip .html)
  var publicPages = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html',
                     'login', 'register', 'forgot-password', 'reset-password'];
  // Recovery page: มี session จาก recovery token แต่ user ต้องเข้ามาตั้งรหัสผ่าน
  // ก่อน ห้าม redirect ไป network แม้มี session (bypass rule "public + session = network")
  var recoveryPages = ['reset-password.html', 'reset-password'];

  // ===== Auth State Check =====
  async function checkAuth() {
    var currentPage = window.location.pathname.split('/').pop() || 'network.html';
    var isPublicPage = publicPages.indexOf(currentPage) !== -1;
    var isRecoveryPage = recoveryPages.indexOf(currentPage) !== -1;

    var session = await window.bizGetSession();

    // Defense in depth: ถ้า Supabase setting หลุด/ถูกเปลี่ยน อย่าให้ session
    // ที่ยังไม่ยืนยันอีเมลเข้าระบบได้ (OAuth จะ set email_confirmed_at อัตโนมัติ)
    if (session && !session.user.email_confirmed_at) {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html?unconfirmed=1';
      return null;
    }

    if (!session && !isPublicPage) {
      window.location.href = 'login.html';
      return null;
    }

    if (session && isPublicPage && !isRecoveryPage) {
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
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin + '/network.html'
      }
    });

    if (error) return { error: window.bizErr(error) };

    // กัน Supabase setting หลุด: ถ้า signUp คืน session มาทั้งที่ยังไม่ยืนยันอีเมล
    // ให้ sign out ทันที — ไม่ให้สถานะ "logged in โดยไม่ confirm" เกิดขึ้นได้
    if (data && data.session && data.user && !data.user.email_confirmed_at) {
      await supabaseClient.auth.signOut();
    }

    // Detect "email already registered + confirmed" case — Supabase default
    // enumeration protection returns fake-success, identities=[] is the tell.
    // UX preference: เลือก explicit error ดีกว่าปิดเงียบ
    if (data && data.user && !data.session &&
        Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { alreadyRegistered: true };
    }

    return { data: data };
  }

  // ===== Login =====
  async function login(email, password) {
    var { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      var code = (error.code || error.error_code || '').toLowerCase();
      var msg = (error.message || '').toLowerCase();
      var needsConfirm = code === 'email_not_confirmed' || msg.indexOf('email not confirmed') !== -1;
      return { error: window.bizErr(error), needsConfirm: needsConfirm };
    }
    return { data: data };
  }

  // ===== Send password recovery email =====
  async function sendPasswordRecovery(email) {
    var { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    if (error) return { error: window.bizErr(error) };
    return { data: true };
  }

  // ===== Update password (ใช้ใน reset-password.html หลัง user คลิก recovery link) =====
  async function updatePassword(newPassword) {
    var { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) return { error: window.bizErr(error) };
    return { data: true };
  }

  // ===== Change email (ใช้ใน settings; Supabase จะส่งเมลยืนยันทั้งคู่) =====
  async function changeEmail(newEmail) {
    var { error } = await supabaseClient.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: window.location.origin + '/network.html' }
    );
    if (error) return { error: window.bizErr(error) };
    return { data: true };
  }

  // ===== Resend email confirmation =====
  async function resendConfirmation(email) {
    var { error } = await supabaseClient.auth.resend({
      type: 'signup',
      email: email
    });
    if (error) return { error: window.bizErr(error) };
    return { data: true };
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
      var publicOrIndex = ['login.html', 'register.html', 'index.html', '', 'login', 'register', 'index'];
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
    logout: logout,
    resendConfirmation: resendConfirmation,
    sendPasswordRecovery: sendPasswordRecovery,
    updatePassword: updatePassword,
    changeEmail: changeEmail
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
