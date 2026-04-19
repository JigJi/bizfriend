/* ============================================
   bizfriend - Settings
   ============================================ */

(function () {
  'use strict';

  var currentUser = null;

  async function init() {
    // ใช้ getUser() เพื่อดึง user ล่าสุดจาก server (มี identities ที่อัปเดตแล้ว)
    // ไม่ใช้ getSession() เพราะ cache ใน localStorage อาจค้างค่าเก่าหลัง updateUser
    var { data, error } = await supabaseClient.auth.getUser();
    if (error || !data || !data.user) return;
    currentUser = data.user;
    renderPasswordSection();
    loadBlockedUsers();
    wireEmailChange();
  }

  function wireEmailChange() {
    // OAuth users: hide เพราะ email ถูก manage โดย provider (Google)
    var identities = currentUser.identities || [];
    var providersList = (currentUser.app_metadata && currentUser.app_metadata.providers) || [];
    var hasOAuth = identities.some(function (i) { return i.provider !== 'email'; })
      || providersList.some(function (p) { return p !== 'email'; });

    var section = document.getElementById('email-change-section');
    if (!section) return;
    if (hasOAuth) return; // leave hidden

    section.classList.remove('hidden');
    var toggle = document.getElementById('email-change-toggle');
    var form = document.getElementById('email-change-form');
    if (toggle && form) {
      toggle.addEventListener('click', function () {
        var willShow = form.classList.contains('hidden');
        form.classList.toggle('hidden', !willShow);
        form.classList.toggle('flex', willShow);
        if (willShow) {
          var input = document.getElementById('new-email');
          if (input) input.focus();
        }
      });
    }
  }

  async function changeEmail() {
    var input = document.getElementById('new-email');
    var statusEl = document.getElementById('email-change-status');
    var newEmail = (input.value || '').trim();
    statusEl.classList.add('hidden');

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      statusEl.textContent = 'รูปแบบอีเมลไม่ถูกต้อง';
      statusEl.className = 'text-xs mt-1 text-red-600';
      statusEl.classList.remove('hidden');
      return;
    }
    if (newEmail === currentUser.email) {
      statusEl.textContent = 'อีเมลใหม่ต้องไม่ซ้ำกับเดิม';
      statusEl.className = 'text-xs mt-1 text-red-600';
      statusEl.classList.remove('hidden');
      return;
    }

    var result = await window.bizAuth.changeEmail(newEmail);
    if (result.error) {
      statusEl.textContent = result.error;
      statusEl.className = 'text-xs mt-1 text-red-600';
      statusEl.classList.remove('hidden');
      return;
    }

    statusEl.innerHTML = 'ส่งลิงก์ยืนยันไปที่ <b>' + currentUser.email + '</b> และ <b>' + newEmail + '</b> แล้ว — คลิกลิงก์ทั้ง 2 อีเมลเพื่อเปลี่ยนสำเร็จ';
    statusEl.className = 'text-xs mt-1 text-green-700';
    statusEl.classList.remove('hidden');
    input.value = '';
  }

  function cancelEmailChange() {
    var form = document.getElementById('email-change-form');
    var input = document.getElementById('new-email');
    var statusEl = document.getElementById('email-change-status');
    if (form) {
      form.classList.add('hidden');
      form.classList.remove('flex');
    }
    if (input) input.value = '';
    if (statusEl) statusEl.classList.add('hidden');
  }

  async function renderPasswordSection() {
    var emailEl = document.getElementById('settings-email');
    if (emailEl) emailEl.textContent = currentUser.email || '-';

    // เช็คจาก server ว่ามี password ไหม (อ่าน auth.users.encrypted_password ผ่าน RPC)
    // เหตุผล: Supabase ไม่ได้ sync identities ฝั่ง client เมื่อ OAuth user ตั้ง password
    var { data: hasPassword } = await supabaseClient.rpc('i_have_password');

    // Detect OAuth provider
    var identities = currentUser.identities || [];
    var providersList = (currentUser.app_metadata && currentUser.app_metadata.providers) || [];
    var oauthIdentity = identities.find(function (i) { return i.provider !== 'email'; });
    var oauthName = oauthIdentity
      ? oauthIdentity.provider
      : providersList.find(function (p) { return p !== 'email'; });

    // Provider badge
    var badge = document.getElementById('settings-provider-badge');
    if (badge) {
      if (oauthName) {
        badge.classList.remove('hidden');
        badge.textContent = 'เชื่อมต่อด้วย ' + (oauthName === 'google' ? 'Google' : oauthName);
      } else {
        badge.classList.add('hidden');
      }
    }

    // สลับ section ตามสถานะ password (เช็คจาก server)
    var emailSection = document.getElementById('password-section-email');
    var oauthSection = document.getElementById('password-section-oauth');
    if (hasPassword) {
      emailSection.classList.remove('hidden');
      oauthSection.classList.add('hidden');
    } else {
      oauthSection.classList.remove('hidden');
      emailSection.classList.add('hidden');
    }
  }

  // เรียกหลัง updateUser สำเร็จ — ดึง user ใหม่จาก server แล้ว re-render
  async function refreshUser() {
    var { data } = await supabaseClient.auth.getUser();
    if (data && data.user) {
      currentUser = data.user;
      renderPasswordSection();
    }
  }

  async function changePassword() {
    var pw = document.getElementById('new-password').value;
    var confirm = document.getElementById('confirm-password').value;
    if (!validatePasswordPair(pw, confirm)) return;

    var { error } = await supabaseClient.auth.updateUser({ password: pw });
    if (error) {
      alert('เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    await refreshUser();
    alert('เปลี่ยนรหัสผ่านสำเร็จ');
  }

  async function setPassword() {
    var pw = document.getElementById('new-password-oauth').value;
    var confirm = document.getElementById('confirm-password-oauth').value;
    if (!validatePasswordPair(pw, confirm)) return;

    var { error } = await supabaseClient.auth.updateUser({ password: pw });
    if (error) {
      alert('ตั้งรหัสผ่านไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }
    document.getElementById('new-password-oauth').value = '';
    document.getElementById('confirm-password-oauth').value = '';
    await refreshUser();
    alert('ตั้งรหัสผ่านสำเร็จ — ตอนนี้คุณเข้าสู่ระบบด้วยอีเมลได้แล้ว');
  }

  function validatePasswordPair(pw, confirm) {
    if (!pw || pw.length < 6) {
      alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัว');
      return false;
    }
    if (pw !== confirm) {
      alert('รหัสผ่านยืนยันไม่ตรงกัน');
      return false;
    }
    return true;
  }

  async function deleteAccount() {
    var ok = confirm('ลบบัญชีถาวร? ข้อมูลทั้งหมดจะหายไปและกู้คืนไม่ได้');
    if (!ok) return;
    var ok2 = confirm('ยืนยันอีกครั้ง — ลบบัญชีจริงๆ ใช่ไหม?');
    if (!ok2) return;

    var { error } = await supabaseClient.rpc('delete_my_account');
    if (error) {
      alert('ลบบัญชีไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }

    await supabaseClient.auth.signOut();
    alert('ลบบัญชีเรียบร้อยแล้ว');
    window.location.href = 'login.html';
  }

  // ===== Blocked users =====
  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML;
  }

  async function loadBlockedUsers() {
    var listEl = document.getElementById('blocked-list');
    var countEl = document.getElementById('blocked-count');
    if (!listEl) return;

    var { data, error } = await supabaseClient.rpc('my_blocked_users');
    if (error) {
      listEl.innerHTML = '<div class="text-sm text-slate-400 py-2">โหลดไม่สำเร็จ</div>';
      return;
    }

    var rows = data || [];
    if (countEl) countEl.textContent = rows.length ? rows.length + ' คน' : '';

    if (!rows.length) {
      listEl.innerHTML = '<div class="text-sm text-slate-400 py-2">คุณยังไม่ได้บล็อกใคร</div>';
      return;
    }

    listEl.innerHTML = rows.map(function (r) {
      var name = r.display_name || 'ไม่มีชื่อ';
      var initial = name.charAt(0) || '?';
      var s = window.bizAvatarStyle(r.user_id);
      var avatarHtml = r.avatar_url
        ? '<img src="' + escapeHtml(r.avatar_url) + '" class="w-10 h-10 rounded-full object-cover flex-shrink-0">'
        : '<div class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0" style="background:' + s.bg + ';color:' + s.fg + '">' + escapeHtml(initial) + '</div>';
      return (
        '<div class="flex items-center gap-3 py-1">' +
          avatarHtml +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-sm font-medium text-slate-700 truncate">' + escapeHtml(name) + '</div>' +
          '</div>' +
          '<button onclick="bizSettings.unblock(\'' + escapeHtml(r.user_id) + '\')" class="text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 transition-colors flex-shrink-0">ยกเลิกการบล็อก</button>' +
        '</div>'
      );
    }).join('');
  }

  async function unblock(targetId) {
    if (!targetId) return;
    var { error } = await supabaseClient.rpc('unblock_user', { target_id: targetId });
    if (error) {
      alert('ยกเลิกการบล็อกไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }
    loadBlockedUsers();
  }

  window.bizSettings = {
    changePassword: changePassword,
    setPassword: setPassword,
    changeEmail: changeEmail,
    cancelEmailChange: cancelEmailChange,
    deleteAccount: deleteAccount,
    unblock: unblock,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
