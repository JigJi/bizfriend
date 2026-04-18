/* ============================================
   bizfriend - Profile Management
   ============================================ */

(function () {
  'use strict';

  var currentUser = null;        // ผู้ใช้ที่ login อยู่
  var viewedUserId = null;       // user_id ของโปรไฟล์ที่กำลังดู (own หรือคนอื่น)
  var isOwn = true;              // กำลังดูของตัวเองหรือไม่
  var currentProfile = null;
  var currentPhotos = [];        // array ของรูปที่โชว์อยู่ใน grid (สำหรับ lightbox prev/next)
  var lightboxIndex = 0;

  // ===== Load Profile =====
  async function loadProfile() {
    var { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    currentUser = session.user;

    // เช็ค ?user= param
    var params = new URLSearchParams(window.location.search);
    var requestedUser = params.get('user');
    viewedUserId = requestedUser && requestedUser !== currentUser.id ? requestedUser : currentUser.id;
    isOwn = viewedUserId === currentUser.id;

    if (!isOwn) {
      document.body.classList.add('view-other');
      // wire ปุ่ม ส่งข้อความ
      var sendBtn = document.getElementById('send-message-btn');
      if (sendBtn) sendBtn.href = 'chat.html?with=' + encodeURIComponent(viewedUserId);
      var privateBtn = document.getElementById('private-send-message-btn');
      if (privateBtn) privateBtn.href = 'chat.html?with=' + encodeURIComponent(viewedUserId);
    }

    // โหลดทุกอย่าง parallel (+ favorites relation)
    var favoritesPromise = isOwn
      ? supabaseClient.from('favorites').select('favorited_user_id, profiles:favorited_user_id(id, display_name, avatar_url)').eq('user_id', currentUser.id)
      : supabaseClient.from('favorites').select('favorited_user_id').eq('user_id', currentUser.id).eq('favorited_user_id', viewedUserId).maybeSingle();

    var [profileRes, photosRes, interestsRes, friendCountRes, postsRes, favRes] = await Promise.all([
      supabaseClient.from('profiles').select('*').eq('id', viewedUserId).single(),
      supabaseClient.from('photos').select('*').eq('user_id', viewedUserId).order('sort_order'),
      supabaseClient.from('interests').select('*').eq('user_id', viewedUserId),
      supabaseClient.from('friends').select('*', { count: 'exact', head: true })
        .or('user_id.eq.' + viewedUserId + ',friend_id.eq.' + viewedUserId)
        .eq('status', 'accepted'),
      supabaseClient.from('posts').select('*').eq('user_id', viewedUserId).order('created_at', { ascending: false }),
      favoritesPromise,
    ]);

    var profile = profileRes.data;
    if (!profile) {
      alert('ไม่พบโปรไฟล์นี้');
      return;
    }
    currentProfile = profile;

    // enforce privacy level เฉพาะตอนดูคนอื่น
    if (!isOwn) {
      var vis = profile.profile_visibility || 'public';
      if (vis === 'limited') document.body.classList.add('view-limited');
      if (vis === 'private') {
        document.body.classList.add('view-private');
        renderPrivatePlaceholder(profile);
      }
    }

    renderProfile(profile);
    renderPhotos(photosRes.data || []);
    renderInterests(interestsRes.data || []);
    renderUserPosts(postsRes.data || []);

    if (isOwn) {
      renderFavoritesList(favRes.data || []);
    } else {
      // favRes is single row (or null) → set heart state
      updateProfileFavButton(!!favRes.data);
    }

    var friendCount = friendCountRes.count;
    var postCount = (postsRes.data || []).length;

    var el = document.getElementById('friend-count');
    if (el) el.textContent = friendCount || 0;
    el = document.getElementById('post-count');
    if (el) el.textContent = postCount || 0;
  }

  // ===== Render Profile =====
  function renderProfile(p) {
    setText('profile-name', p.display_name || '');
    setText('profile-bio-text', p.bio || 'ยังไม่ได้เขียนเกี่ยวกับตัวเอง');
    setText('profile-tagline', buildTagline(p));

    // Avatar (ใช้รูปจริง หรือสีสุ่มจาก user_id)
    // อัปเดตเฉพาะ <span.profile-avatar-inner> ใน label ใหญ่ (ไม่แตะ input + overlay)
    var bigAvatar = document.querySelector('.profile-avatar-lg .profile-avatar-inner');
    if (bigAvatar) {
      var style = window.bizAvatarStyle(viewedUserId);
      if (p.avatar_url) {
        bigAvatar.innerHTML = '<img src="' + p.avatar_url + '" class="w-full h-full object-cover" alt="">';
        bigAvatar.style.background = '';
        bigAvatar.style.color = '';
      } else {
        bigAvatar.textContent = (p.display_name || '?').charAt(0);
        bigAvatar.style.background = style.bg;
        bigAvatar.style.color = style.fg;
      }
    }

    // Cover
    if (p.cover_url) {
      var coverEl = document.getElementById('profile-cover');
      if (coverEl) coverEl.style.backgroundImage = 'url(' + p.cover_url + ')';
    }

    // Location
    setText('profile-location', p.province || '-');

    // Looking for
    var lookingEl = document.getElementById('profile-looking');
    if (lookingEl && p.looking_for && p.looking_for.length) {
      lookingEl.textContent = p.looking_for.join(' / ');
    }

    // Basic info
    setText('profile-province', p.province || '-');
    setText('profile-education', p.education || '-');
    setText('profile-work', p.work || '-');
    setText('profile-languages', p.languages || '-');

    // Visibility — เฉพาะเจ้าของ
    if (isOwn) {
      updateVisibilityLabel(p.profile_visibility || 'public');
    }

    // Edit form defaults — เฉพาะเจ้าของเท่านั้น
    if (isOwn) {
      setVal('edit-name', p.display_name);
      setVal('edit-bio', p.bio);
      setVal('edit-age', p.age);
      setVal('edit-weight', p.weight);
      setVal('edit-height', p.height);
      setVal('edit-role', p.role);
      setEditProvince(p.province || '');
      setVal('edit-education', p.education);
      setVal('edit-work', p.work);
      setVal('edit-languages', p.languages);

      if (p.looking_for) {
        p.looking_for.forEach(function (v) {
          var cb = document.querySelector('input[name="looking_for"][value="' + v + '"]');
          if (cb) cb.checked = true;
        });
      }
    }
  }

  function statPill(icon, text) {
    return '<div class="flex items-center gap-2 bg-blue-50 rounded-full px-4 py-2">' +
      '<span class="material-symbols-rounded text-primary text-lg">' + icon + '</span>' +
      '<span class="text-sm font-medium text-slate-700">' + text + '</span></div>';
  }

  function buildTagline(p) {
    var parts = [];
    if (p.age) parts.push(p.age + ' ปี');
    if (p.weight) parts.push(p.weight + ' กก.');
    if (p.height) parts.push(p.height + ' ซม.');
    if (p.role) parts.push(p.role);
    return parts.join(' | ') || '';
  }

  // ===== Render Photos =====
  function renderPhotos(photos) {
    var grid = document.getElementById('photos-grid');
    if (!grid) return;

    currentPhotos = photos.slice(); // เก็บไว้ให้ lightbox ใช้ navigate

    var html = '';
    photos.forEach(function (photo, idx) {
      html += '<div class="relative group w-28 h-28 flex-shrink-0">' +
        '<img src="' + photo.url + '" alt="" class="stealth-blur w-full h-full object-cover rounded-xl cursor-zoom-in" onclick="bizProfile.openPhoto(' + idx + ')">' +
        (isOwn
          ? '<button onclick="bizProfile.deletePhoto(\'' + photo.id + '\')" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"><span class="material-symbols-rounded text-sm">close</span></button>'
          : '') +
        '</div>';
    });

    // Add button — เฉพาะเจ้าของ
    if (isOwn) {
      html += '<label class="w-28 h-28 flex-shrink-0 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-primary hover:text-primary cursor-pointer transition-colors">' +
        '<input type="file" accept="image/*" multiple class="hidden" onchange="bizProfile.uploadPhotos(this)">' +
        '<span class="material-symbols-rounded text-2xl">add_photo_alternate</span>' +
        '<span class="text-xs mt-1">เพิ่มรูป</span></label>';
    } else if (photos.length === 0) {
      html = '<div class="w-full text-center py-6 text-sm text-slate-400">ยังไม่มีรูปภาพ</div>';
    }

    grid.innerHTML = html;
  }

  // ===== Render Interests =====
  function renderInterests(interests) {
    var container = document.getElementById('interests-display');
    if (!container) return;

    var colors = { general: 'badge-blue', hobby: 'badge-green', music: 'badge-amber', other: 'badge-slate' };
    var html = '';
    interests.forEach(function (i) {
      var cls = colors[i.category] || 'badge-blue';
      html += '<span class="badge ' + cls + '">' + i.name + '</span>';
    });
    container.innerHTML = html || '<span class="text-sm text-slate-400">ยังไม่ได้เพิ่มความสนใจ</span>';
  }

  // ===== Render Private Placeholder =====
  function renderPrivatePlaceholder(p) {
    var ph = document.getElementById('private-placeholder');
    if (!ph) return;
    ph.classList.remove('hidden');

    var nameEl = document.getElementById('private-placeholder-name');
    if (nameEl) nameEl.textContent = p.display_name || 'ไม่มีชื่อ';

    var avatarEl = document.getElementById('private-placeholder-avatar');
    if (avatarEl) {
      var style = window.bizAvatarStyle(viewedUserId);
      if (p.avatar_url) {
        avatarEl.innerHTML = '<img src="' + p.avatar_url + '" class="w-full h-full object-cover rounded-full" alt="">';
      } else {
        avatarEl.textContent = (p.display_name || '?').charAt(0);
        avatarEl.style.background = style.bg;
        avatarEl.style.color = style.fg;
        avatarEl.style.fontSize = '2rem';
        avatarEl.style.fontWeight = '700';
      }
    }
  }

  // ===== Edit Province (searchable dropdown) =====
  function toggleEditProvinceMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('edit-province-menu');
    if (!menu) return;
    var willShow = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (willShow) {
      renderEditProvinceList('');
      var search = document.getElementById('edit-province-search');
      if (search) { search.value = ''; setTimeout(function () { search.focus(); }, 0); }
    }
  }

  function closeEditProvinceMenu() {
    var menu = document.getElementById('edit-province-menu');
    if (menu) menu.classList.add('hidden');
  }

  function renderEditProvinceList(query) {
    var list = document.getElementById('edit-province-list');
    if (!list) return;
    query = (query || '').trim();
    var provinces = window.BIZ_PROVINCES || [];
    var filtered = query
      ? provinces.filter(function (p) { return p.indexOf(query) !== -1; })
      : provinces;
    var current = (document.getElementById('edit-province') || {}).value || '';

    var html = '<button type="button" class="edit-province-option w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ' + (!current ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-400') + '" data-province="">— ไม่ระบุ —</button>';
    html += filtered.map(function (p) {
      var isActive = p === current;
      return '<button type="button" class="edit-province-option w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ' + (isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700') + '" data-province="' + p + '">' + p + '</button>';
    }).join('');
    if (filtered.length === 0 && query) {
      html += '<div class="px-4 py-4 text-xs text-slate-400 text-center">ไม่พบจังหวัด</div>';
    }
    list.innerHTML = html;
    list.querySelectorAll('.edit-province-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setEditProvince(btn.getAttribute('data-province') || '');
      });
    });
  }

  function setEditProvince(value) {
    var hidden = document.getElementById('edit-province');
    var label = document.getElementById('edit-province-label');
    if (hidden) hidden.value = value;
    if (label) {
      if (value) {
        label.textContent = value;
        label.classList.remove('text-slate-400');
        label.classList.add('text-slate-700');
      } else {
        label.textContent = '— ไม่ระบุ —';
        label.classList.add('text-slate-400');
        label.classList.remove('text-slate-700');
      }
    }
    closeEditProvinceMenu();
  }

  // wire search input + click-outside
  document.addEventListener('DOMContentLoaded', function () {
    var search = document.getElementById('edit-province-search');
    if (search) {
      search.addEventListener('input', function () { renderEditProvinceList(search.value); });
    }
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('edit-province-wrap');
      if (wrap && !wrap.contains(e.target)) closeEditProvinceMenu();
    });
  });

  // ===== Favorites =====
  function renderFavoritesList(rows) {
    var container = document.getElementById('favorites-list');
    var countEl = document.getElementById('favorites-count');
    if (!container) return;
    if (countEl) countEl.textContent = rows.length ? rows.length + ' คน' : '';

    if (!rows.length) {
      container.innerHTML = '<div class="text-center text-sm text-slate-400 py-4 w-full">ยังไม่มีเพื่อนที่ถูกใจ — เข้าไปในหน้าโปรไฟล์ของเพื่อน แล้วกดหัวใจ ❤️</div>';
      return;
    }

    container.innerHTML = rows.map(function (row) {
      var p = row.profiles || {};
      var name = p.display_name || 'ไม่มีชื่อ';
      var initial = name.charAt(0) || '?';
      var href = 'profile.html?user=' + encodeURIComponent(row.favorited_user_id);
      var s = window.bizAvatarStyle(row.favorited_user_id);
      var avatarHtml = p.avatar_url
        ? '<img src="' + p.avatar_url + '" class="w-12 h-12 rounded-full object-cover">'
        : '<div class="w-12 h-12 rounded-full flex items-center justify-center font-semibold" style="background:' + s.bg + ';color:' + s.fg + '">' + initial + '</div>';
      return (
        '<a href="' + href + '" class="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 rounded-full pr-4 pl-1 py-1 transition-colors" style="color:inherit;text-decoration:none;">' +
          avatarHtml +
          '<span class="text-sm font-medium text-slate-700">' + name + '</span>' +
        '</a>'
      );
    }).join('');
  }

  function updateProfileFavButton(isFav) {
    var icon = document.getElementById('profile-fav-icon');
    if (!icon) return;
    if (isFav) {
      icon.style.color = '#ef4444';
      icon.style.fontVariationSettings = "'FILL' 1";
    } else {
      icon.style.color = '#94a3b8';
      icon.style.fontVariationSettings = "'FILL' 0";
    }
  }

  async function toggleFavoriteThisProfile() {
    if (isOwn || !viewedUserId) return;
    // เช็คสถานะปัจจุบันจาก icon
    var icon = document.getElementById('profile-fav-icon');
    var isFav = icon && icon.style.color === 'rgb(239, 68, 68)';

    if (isFav) {
      var { error } = await supabaseClient
        .from('favorites').delete()
        .eq('user_id', currentUser.id)
        .eq('favorited_user_id', viewedUserId);
      if (error) { alert('ลบออกจากรายการไม่สำเร็จ: ' + window.bizErr(error)); return; }
      updateProfileFavButton(false);
      showToast('ลบออกจากรายการแล้ว');
    } else {
      var { error: e2 } = await supabaseClient
        .from('favorites')
        .insert({ user_id: currentUser.id, favorited_user_id: viewedUserId });
      if (e2) { alert('เพิ่มในรายการไม่สำเร็จ: ' + window.bizErr(e2)); return; }
      updateProfileFavButton(true);
      showToast('เพิ่มในรายการแล้ว');
    }
  }

  // ===== Privacy menu (custom dropdown) =====
  var VIS_LABELS = {
    public: '🟢 เปิดเผย',
    limited: '🟡 จำกัด',
    private: '🔴 ส่วนตัว',
  };

  function updateVisibilityLabel(value) {
    var el = document.getElementById('privacy-current-label');
    if (el) el.textContent = VIS_LABELS[value] || VIS_LABELS.public;
  }

  function togglePrivacyMenu(e) {
    if (e) e.stopPropagation();
    var panel = document.getElementById('privacy-menu-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
  }

  function closePrivacyMenu() {
    var panel = document.getElementById('privacy-menu-panel');
    if (panel) panel.classList.add('hidden');
  }

  async function pickVisibility(value) {
    closePrivacyMenu();
    updateVisibilityLabel(value);
    await saveVisibility(value);
  }

  async function saveVisibility(value) {
    if (!currentUser) return;
    var { error } = await supabaseClient
      .from('profiles')
      .update({ profile_visibility: value })
      .eq('id', currentUser.id);
    if (error) {
      alert('บันทึกไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }
    if (currentProfile) currentProfile.profile_visibility = value;
    var label = { public: 'เปิดเผย', limited: 'จำกัด', private: 'ส่วนตัว' }[value] || value;
    showToast('ตั้งเป็น "' + label + '" แล้ว');
  }

  // click outside → close menu
  document.addEventListener('click', function (e) {
    var menu = document.getElementById('privacy-menu');
    if (menu && !menu.contains(e.target)) closePrivacyMenu();
  });

  // ===== Photo Lightbox =====
  function openPhoto(index) {
    if (!currentPhotos.length) return;
    lightboxIndex = Math.max(0, Math.min(index, currentPhotos.length - 1));
    var lb = document.getElementById('photo-lightbox');
    if (!lb) return;
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderLightbox();
  }

  function renderLightbox() {
    var img = document.getElementById('photo-lightbox-img');
    var counter = document.getElementById('photo-counter');
    var prevBtn = document.getElementById('photo-prev-btn');
    var nextBtn = document.getElementById('photo-next-btn');
    if (!img) return;

    img.src = currentPhotos[lightboxIndex].url;

    if (counter) counter.textContent = (lightboxIndex + 1) + ' / ' + currentPhotos.length;

    // ถ้ามีรูปเดียว ซ่อนปุ่ม prev/next
    var multi = currentPhotos.length > 1;
    if (prevBtn) prevBtn.style.display = multi ? '' : 'none';
    if (nextBtn) nextBtn.style.display = multi ? '' : 'none';
  }

  function prevPhoto() {
    if (!currentPhotos.length) return;
    lightboxIndex = (lightboxIndex - 1 + currentPhotos.length) % currentPhotos.length;
    renderLightbox();
  }

  function nextPhoto() {
    if (!currentPhotos.length) return;
    lightboxIndex = (lightboxIndex + 1) % currentPhotos.length;
    renderLightbox();
  }

  function closePhoto(e, force) {
    // ถ้าไม่ใช่การกดที่ backdrop หรือปุ่ม close → ignore
    if (!force && e && e.target !== e.currentTarget) return;
    var lb = document.getElementById('photo-lightbox');
    if (!lb) return;
    lb.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Keyboard: Esc/Arrow keys (เฉพาะตอน lightbox เปิด)
  document.addEventListener('keydown', function (e) {
    var lb = document.getElementById('photo-lightbox');
    if (!lb || lb.classList.contains('hidden')) return;
    if (e.key === 'Escape') closePhoto(null, true);
    else if (e.key === 'ArrowLeft') prevPhoto();
    else if (e.key === 'ArrowRight') nextPhoto();
  });

  // ===== Render User Posts =====
  function renderUserPosts(posts) {
    var container = document.getElementById('user-posts-list');
    var countEl = document.getElementById('posts-header-count');
    if (!container) return;

    if (countEl) countEl.textContent = posts.length ? posts.length + ' โพสต์' : '';

    if (!posts.length) {
      container.innerHTML = '<div class="text-center text-sm text-slate-400 py-4">' + (isOwn ? 'คุณยังไม่ได้โพสต์อะไร' : 'ยังไม่มีโพสต์') + '</div>';
      return;
    }

    container.innerHTML = posts.map(function (post) {
      var time = getTimeAgo(post.created_at);
      var editedMark = post.updated_at
        ? '<span class="text-xs text-slate-300 italic">(แก้ไขแล้ว)</span>'
        : '';
      var archivedMark = post.archived_at
        ? '<span class="text-xs text-slate-400 italic">(เก่า)</span>'
        : '';
      var isArchived = !!post.archived_at;
      var tagHtml = '';
      if (post.tags && post.tags.length) {
        tagHtml = post.tags.map(function (t) {
          return '<span class="badge badge-blue">' + escapeHtml(t) + '</span>';
        }).join(' ');
      }
      var locationHtml = post.province
        ? '<span class="text-xs text-slate-400 flex items-center gap-0.5"><span class="material-symbols-rounded text-xs">location_on</span>' + escapeHtml(post.province) + '</span>'
        : '';
      var deleteBtn = isOwn
        ? '<button onclick="bizProfile.deleteUserPost(\'' + post.id + '\')" class="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center flex-shrink-0" title="ลบโพสต์"><span class="material-symbols-rounded text-slate-400 hover:text-red-500 text-base">delete</span></button>'
        : '';
      return (
        '<div class="border border-slate-100 rounded-xl p-3 flex items-start gap-3 ' + (isArchived ? 'opacity-60' : '') + '">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
              '<span class="text-xs text-slate-400">' + time + '</span>' +
              archivedMark +
              editedMark +
              locationHtml +
              tagHtml +
            '</div>' +
            '<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">' + escapeHtml(post.content) + '</p>' +
          '</div>' +
          deleteBtn +
        '</div>'
      );
    }).join('');
  }

  async function deleteUserPost(postId) {
    if (!confirm('ลบโพสต์นี้?')) return;
    var { error } = await supabaseClient.from('posts').delete().eq('id', postId);
    if (error) { alert('ลบไม่สำเร็จ: ' + window.bizErr(error)); return; }
    var { data } = await supabaseClient.from('posts').select('*').eq('user_id', viewedUserId).order('created_at', { ascending: false });
    renderUserPosts(data || []);
    showToast('ลบโพสต์แล้ว');
  }

  function getTimeAgo(dateStr) {
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'เมื่อกี้';
    if (mins < 60) return mins + ' นาที';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' ชม.';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + ' วัน';
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : text;
    return div.innerHTML;
  }

  // ===== Edit Mode Toggle =====
  function toggleEdit(section) {
    var display = document.getElementById(section + '-display');
    var edit = document.getElementById(section + '-edit');
    if (!display || !edit) return;
    display.classList.toggle('hidden');
    edit.classList.toggle('hidden');
  }

  // ===== Save Profile Info =====
  async function saveProfile() {
    var lookingFor = [];
    document.querySelectorAll('input[name="looking_for"]:checked').forEach(function (cb) {
      lookingFor.push(cb.value);
    });

    var updates = {
      display_name: getVal('edit-name'),
      bio: getVal('edit-bio'),
      age: parseInt(getVal('edit-age')) || null,
      weight: parseInt(getVal('edit-weight')) || null,
      height: parseInt(getVal('edit-height')) || null,
      role: getVal('edit-role') || null,
      province: getVal('edit-province') || null,
      education: getVal('edit-education') || null,
      work: getVal('edit-work') || null,
      languages: getVal('edit-languages') || null,
      looking_for: lookingFor
    };

    var { error } = await supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', currentUser.id);

    if (error) {
      alert('บันทึกไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }

    // Refresh
    Object.assign(currentProfile, updates);
    renderProfile(currentProfile);

    // Close all edit modes
    ['header', 'personal', 'about', 'basic', 'looking'].forEach(function (s) {
      var edit = document.getElementById(s + '-edit');
      var display = document.getElementById(s + '-display');
      if (edit && !edit.classList.contains('hidden')) {
        edit.classList.add('hidden');
        if (display) display.classList.remove('hidden');
      }
    });

    showToast('บันทึกสำเร็จ');
  }

  // ===== Upload Avatar =====
  async function uploadAvatar(input) {
    var file = input.files[0];
    if (!file) return;

    var ext = file.name.split('.').pop();
    var path = currentUser.id + '/avatar.' + ext;

    var { error: upErr } = await supabaseClient.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (upErr) { alert('อัปโหลดไม่สำเร็จ: ' + window.bizErr(upErr)); return; }

    var { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(path);
    var url = urlData.publicUrl + '?t=' + Date.now();

    await supabaseClient.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
    currentProfile.avatar_url = url;
    renderProfile(currentProfile);
    showToast('เปลี่ยนรูปโปรไฟล์แล้ว');
  }

  // ===== Upload Cover =====
  async function uploadCover(input) {
    var file = input.files[0];
    if (!file) return;

    var ext = file.name.split('.').pop();
    var path = currentUser.id + '/cover.' + ext;

    var { error: upErr } = await supabaseClient.storage
      .from('covers')
      .upload(path, file, { upsert: true });

    if (upErr) { alert('อัปโหลดไม่สำเร็จ: ' + window.bizErr(upErr)); return; }

    var { data: urlData } = supabaseClient.storage.from('covers').getPublicUrl(path);
    var url = urlData.publicUrl + '?t=' + Date.now();

    await supabaseClient.from('profiles').update({ cover_url: url }).eq('id', currentUser.id);
    currentProfile.cover_url = url;
    document.getElementById('profile-cover').style.backgroundImage = 'url(' + url + ')';
    showToast('เปลี่ยนภาพปกแล้ว');
  }

  // ===== Upload Photos (multiple) =====
  async function uploadPhotos(input) {
    var files = input.files;
    if (!files.length) return;

    var count = 0;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var ext = file.name.split('.').pop();
      var name = Date.now() + '_' + i + '.' + ext;
      var path = currentUser.id + '/' + name;

      var { error: upErr } = await supabaseClient.storage
        .from('photos')
        .upload(path, file);

      if (upErr) { alert('อัปโหลดไม่สำเร็จ: ' + window.bizErr(upErr)); continue; }

      var { data: urlData } = supabaseClient.storage.from('photos').getPublicUrl(path);

      var { error: dbErr } = await supabaseClient.from('photos').insert({
        user_id: currentUser.id,
        url: urlData.publicUrl
      });

      if (!dbErr) count++;
    }

    // Reload photos
    var { data: photos } = await supabaseClient
      .from('photos')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order');
    renderPhotos(photos || []);
    if (count) showToast('เพิ่ม ' + count + ' รูปแล้ว');
  }

  // ===== Delete Photo =====
  async function deletePhoto(photoId) {
    if (!confirm('ลบรูปนี้?')) return;

    await supabaseClient.from('photos').delete().eq('id', photoId);

    var { data: photos } = await supabaseClient
      .from('photos')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order');
    renderPhotos(photos || []);
    showToast('ลบรูปแล้ว');
  }

  // ===== Save Interests =====
  async function saveInterests() {
    var input = document.getElementById('edit-interests');
    if (!input) return;

    var names = input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    // Delete existing
    await supabaseClient.from('interests').delete().eq('user_id', currentUser.id);

    // Insert new
    if (names.length) {
      var rows = names.map(function (n) {
        return { user_id: currentUser.id, name: n, category: 'general' };
      });
      await supabaseClient.from('interests').insert(rows);
    }

    var { data: interests } = await supabaseClient
      .from('interests')
      .select('*')
      .eq('user_id', currentUser.id);
    renderInterests(interests || []);
    toggleEdit('interests');
    showToast('บันทึกความสนใจแล้ว');
  }

  // ===== Toast =====
  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML =
      '<span class="material-symbols-rounded text-green-500 text-xl flex-shrink-0" style="font-variation-settings: \'FILL\' 1">check_circle</span>' +
      '<span class="flex-1">' + msg + '</span>';
    toast.classList.remove('hidden');
    requestAnimationFrame(function () { toast.classList.add('show'); });
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.classList.add('hidden'); }, 300);
    }, 2500);
  }

  // ===== Helpers =====
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ===== Expose =====
  window.bizProfile = {
    loadProfile: loadProfile,
    toggleEdit: toggleEdit,
    saveProfile: saveProfile,
    uploadAvatar: uploadAvatar,
    uploadCover: uploadCover,
    uploadPhotos: uploadPhotos,
    deletePhoto: deletePhoto,
    saveInterests: saveInterests,
    deleteUserPost: deleteUserPost,
    saveVisibility: saveVisibility,
    togglePrivacyMenu: togglePrivacyMenu,
    pickVisibility: pickVisibility,
    toggleEditProvinceMenu: toggleEditProvinceMenu,
    toggleFavoriteThisProfile: toggleFavoriteThisProfile,
    openPhoto: openPhoto,
    closePhoto: closePhoto,
    prevPhoto: prevPhoto,
    nextPhoto: nextPhoto
  };

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', function () {
    loadProfile();
  });
})();
