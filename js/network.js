/* ============================================
   bizfriend - Network / Posts
   ============================================ */

(function () {
  'use strict';

  var currentUser = null;
  var currentProfile = null;
  var currentPage = 1;
  var pageSize = 20;
  var currentTag = '';
  var currentProvince = '';
  var currentFilterMode = 'all'; // 'all' | 'favorites'
  var myFavorites = new Set(); // Set of user_id ที่ถูกใจ

  var PROVINCES = window.BIZ_PROVINCES;

  // ===== Init =====
  async function init() {
    var session = await window.bizGetSession();
    if (!session) return;
    currentUser = session.user;

    // Profile + Favorites in parallel
    var results = await Promise.all([
      window.bizGetProfile(currentUser.id),
      supabaseClient
        .from('favorites')
        .select('favorited_user_id')
        .eq('user_id', currentUser.id)
    ]);

    var profile = results[0];
    var favResult = results[1];

    if (profile) {
      currentProfile = profile;
      prefillPostForm(profile);
    }

    myFavorites = new Set((favResult.data || []).map(function (r) { return r.favorited_user_id; }));

    initProvinceFilter();
    loadPosts();
  }

  // ===== Favorites =====
  async function toggleFavorite(targetUserId) {
    if (!targetUserId || targetUserId === currentUser.id) return;
    if (myFavorites.has(targetUserId)) {
      // Unfavorite
      var { error } = await supabaseClient
        .from('favorites')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('favorited_user_id', targetUserId);
      if (error) { alert('ลบออกจากรายการไม่สำเร็จ: ' + window.bizErr(error)); return; }
      myFavorites.delete(targetUserId);
    } else {
      // Favorite
      var { error: e2 } = await supabaseClient
        .from('favorites')
        .insert({ user_id: currentUser.id, favorited_user_id: targetUserId });
      if (e2) { alert('เพิ่มในรายการไม่สำเร็จ: ' + window.bizErr(e2)); return; }
      myFavorites.add(targetUserId);
    }
    // re-render only the heart buttons on current feed
    document.querySelectorAll('[data-favorite-user="' + targetUserId + '"]').forEach(function (btn) {
      var active = myFavorites.has(targetUserId);
      btn.innerHTML = '<span class="material-symbols-rounded text-lg" style="font-variation-settings: \'FILL\' ' + (active ? 1 : 0) + ';color:' + (active ? '#ef4444' : '#94a3b8') + '">favorite</span>';
    });
    // ถ้ากำลัง filter by favorites + unfavorite → reload ให้ feed update
    if (currentFilterMode === 'favorites') {
      loadPosts();
    }
  }

  // ===== Prefill Post Form =====
  function prefillPostForm(p) {
    // Avatar + random color ตาม user_id
    var avatar = document.getElementById('post-avatar');
    if (avatar) {
      if (p.avatar_url) {
        avatar.innerHTML = '<img src="' + p.avatar_url + '" class="w-full h-full object-cover rounded-full" alt="">';
        avatar.style.background = '';
        avatar.style.color = '';
      } else {
        var s = window.bizAvatarStyle(currentUser.id);
        avatar.textContent = (p.display_name || '?').charAt(0);
        avatar.style.background = s.bg;
        avatar.style.color = s.fg;
      }
    }

    // Info fields
    var el;
    el = document.getElementById('post-age');
    if (el && p.age) el.value = p.age;
    el = document.getElementById('post-weight');
    if (el && p.weight) el.value = p.weight;
    el = document.getElementById('post-height');
    if (el && p.height) el.value = p.height;
    el = document.getElementById('post-role');
    if (el && p.role) el.value = p.role;
    if (p.province) setPostProvince(p.province);
  }

  // ===== Create Post =====
  async function createPost() {
    var content = document.getElementById('post-text').value.trim();
    if (!content) {
      alert('กรุณาเขียนข้อความ');
      return;
    }

    var tags = [];
    document.querySelectorAll('input[name="post-tag"]:checked').forEach(function (cb) {
      tags.push(cb.value);
    });

    var province = '';
    var provEl = document.getElementById('post-province');
    if (provEl) province = provEl.value;

    var showInfo = !document.getElementById('info-bar').classList.contains('info-bar-off');

    // Archive โพสต์เก่าที่ยัง active ก่อน (single active post per user)
    await supabaseClient
      .from('posts')
      .update({ archived_at: new Date().toISOString() })
      .eq('user_id', currentUser.id)
      .is('archived_at', null);

    var { error } = await supabaseClient.from('posts').insert({
      user_id: currentUser.id,
      content: content,
      tags: tags,
      province: province,
      show_personal_info: showInfo
    });

    if (error) {
      alert('โพสต์ไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }

    // Reset form
    document.getElementById('post-text').value = '';
    document.querySelectorAll('input[name="post-tag"]:checked').forEach(function (cb) { cb.checked = false; });
    document.getElementById('create-post-form').classList.add('hidden');
    document.querySelector('#create-post-toggle .toggle-icon').textContent = 'edit_square';

    // Reload
    currentPage = 1;
    loadPosts();
    showToast('โพสต์สำเร็จ');
  }

  // ===== Load Posts =====
  async function loadPosts() {
    var container = document.getElementById('posts-list');
    if (!container) return;

    var from = (currentPage - 1) * pageSize;
    var to = from + pageSize - 1;

    var query = supabaseClient
      .from('posts')
      .select('*, profiles!inner(display_name, avatar_url, age, weight, height, role, province)', { count: 'exact' })
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (currentTag) {
      query = query.contains('tags', [currentTag]);
    }
    if (currentProvince) {
      query = query.eq('province', currentProvince);
    }
    if (currentFilterMode === 'favorites') {
      var favIds = Array.from(myFavorites);
      if (favIds.length === 0) {
        // ไม่มี favorites → empty
        var container = document.getElementById('posts-list');
        if (container) container.innerHTML = '<div class="text-center py-8 text-slate-400">ยังไม่มีเพื่อนที่ถูกใจ — เข้าไปในหน้าโปรไฟล์ของเพื่อน แล้วกดหัวใจ ❤️</div>';
        renderPagination(0);
        var countEl0 = document.getElementById('post-total');
        if (countEl0) countEl0.textContent = 'แสดง 0 โพสต์';
        return;
      }
      query = query.in('user_id', favIds);
    }

    var { data: posts, count, error } = await query;

    if (error) {
      container.innerHTML = '<div class="text-center py-8 text-slate-400">โหลดโพสต์ไม่สำเร็จ</div>';
      return;
    }

    if (!posts || posts.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-slate-400">ยังไม่มีโพสต์ เป็นคนแรกที่โพสต์เลย!</div>';
      renderPagination(0);
      return;
    }

    var html = '';
    posts.forEach(function (post) {
      html += renderPost(post);
    });
    container.innerHTML = html;
    if (window.bizSyncPresenceDots) window.bizSyncPresenceDots();

    // Post count
    var countEl = document.getElementById('post-total');
    if (countEl) countEl.textContent = 'แสดง ' + (count || 0) + ' โพสต์';

    renderPagination(count || 0);
  }

  // ===== Render Single Post =====
  function renderPost(post) {
    var p = post.profiles;
    var initial = (p.display_name || '?').charAt(0);
    var avStyle = window.bizAvatarStyle(post.user_id);
    var avatarWrapStyle = p.avatar_url ? '' : 'background:' + avStyle.bg + ';color:' + avStyle.fg + ';';
    var avatarHtml = p.avatar_url
      ? '<img src="' + p.avatar_url + '" alt="" class="stealth-blur w-full h-full object-cover">'
      : '<span class="text-lg font-bold">' + initial + '</span>';

    var infoHtml = '';
    if (post.show_personal_info && p.age) {
      infoHtml += '<span class="text-xs text-slate-400">' + p.age + '</span>';
    }
    if (post.show_personal_info && p.height) {
      infoHtml += '<span class="text-xs text-slate-400">| ' + p.height + ' ซม.</span>';
    }
    if (post.show_personal_info && p.weight) {
      infoHtml += '<span class="text-xs text-slate-400">| ' + p.weight + ' กก.</span>';
    }
    if (post.show_personal_info && p.role) {
      infoHtml += '<span class="text-xs text-slate-400">| ' + p.role + '</span>';
    }

    var locationHtml = '';
    if (post.province) {
      locationHtml = '<span class="text-xs text-slate-400 flex items-center gap-0.5"><span class="material-symbols-rounded text-xs">location_on</span>' + post.province + '</span>';
    }

    var tagHtml = '';
    if (post.tags && post.tags.length) {
      tagHtml = post.tags.map(function (t) {
        return '<span class="badge badge-blue">' + escapeHtml(t) + '</span>';
      }).join(' ');
    }

    var timeAgo = getTimeAgo(post.created_at);
    var editedMark = post.updated_at
      ? '<span class="text-xs text-slate-300 italic">(แก้ไขแล้ว)</span>'
      : '';

    var isOwn = post.user_id === currentUser.id;
    var isFav = myFavorites.has(post.user_id);
    // แสดงหัวใจเฉพาะตอน favorite (display-only, ไม่ใช่ปุ่ม)
    var favBadge = (!isOwn && isFav)
      ? '<span class="material-symbols-rounded absolute -top-1 -right-1 z-10 pointer-events-none" style="font-variation-settings: \'FILL\' 1;color:#ef4444;font-size:1.5rem" title="ในรายการถูกใจ">favorite</span>'
      : '';
    var actionHtml = isOwn
      ? '<div class="flex items-center gap-1 flex-shrink-0 self-center">' +
          '<button onclick="bizNetwork.editPost(\'' + post.id + '\')" class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center" title="แก้ไขโพสต์"><span class="material-symbols-rounded text-slate-400 hover:text-primary text-lg">edit</span></button>' +
          '<button onclick="bizNetwork.deletePost(\'' + post.id + '\')" class="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center" title="ลบโพสต์"><span class="material-symbols-rounded text-slate-400 hover:text-red-500 text-lg">delete</span></button>' +
        '</div>'
      : '<a href="chat.html?with=' + encodeURIComponent(post.user_id) + '" class="btn-primary !py-2 !px-4 !text-xs flex-shrink-0 self-center"><span class="material-symbols-rounded text-base">chat</span> แชท</a>';

    var profileHref = 'profile.html?user=' + encodeURIComponent(post.user_id);

    // Footer inline: location + info + tags — ยัดให้อยู่บรรทัดเดียว
    var footerParts = [];
    if (locationHtml) footerParts.push(locationHtml);
    if (infoHtml) footerParts.push(infoHtml);
    if (tagHtml) footerParts.push(tagHtml);
    var footerHtml = footerParts.length
      ? '<div class="flex items-center gap-1.5 flex-wrap mt-1 text-xs">' + footerParts.join('') + '</div>'
      : '';

    // Edited mark inline กับ header (italic + เล็ก)
    var headerEdited = post.updated_at
      ? '<span class="text-[0.625rem] text-slate-300 italic flex-shrink-0">(แก้ไขแล้ว)</span>'
      : '';

    return '<div class="bg-white border border-slate-200/60 rounded-2xl p-3 flex gap-3 items-start" data-post-id="' + post.id + '">' +
      '<div class="relative flex-shrink-0" data-presence-user="' + post.user_id + '" data-presence-size="w-2.5 h-2.5">' +
        '<a href="' + profileHref + '" class="block hover:opacity-75 transition-opacity">' +
          '<div class="w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg overflow-hidden" style="' + avatarWrapStyle + '">' + avatarHtml + '</div>' +
        '</a>' +
        favBadge +
      '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<a href="' + profileHref + '" class="flex items-baseline gap-1.5 no-underline hover:opacity-75 transition-opacity" style="color:inherit;text-decoration:none;">' +
          '<span class="text-sm font-semibold text-slate-800 truncate">' + (p.display_name || 'ไม่ระบุ') + '</span>' +
          '<span class="text-xs text-slate-400 flex-shrink-0">' + timeAgo + '</span>' +
          headerEdited +
        '</a>' +
        '<div data-post-content>' +
          '<p class="text-sm text-slate-700 whitespace-pre-wrap leading-snug line-clamp-2 mt-0.5">' + escapeHtml(post.content) + '</p>' +
          footerHtml +
        '</div>' +
      '</div>' +
      actionHtml +
    '</div>';
  }

  // ===== Edit Post =====
  var editingContent = {}; // เก็บ raw content ไว้ cancel กลับ

  function editPost(postId) {
    var postEl = document.querySelector('[data-post-id="' + postId + '"]');
    if (!postEl) return;
    var contentEl = postEl.querySelector('[data-post-content]');
    if (!contentEl) return;

    // หา content จริง (ใช้ <p> แรก)
    var pEl = contentEl.querySelector('p');
    var currentText = pEl ? pEl.textContent : '';
    editingContent[postId] = contentEl.innerHTML; // save เพื่อ cancel

    contentEl.innerHTML =
      '<textarea id="edit-post-' + postId + '" class="w-full bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-700 border border-primary/30 focus:bg-white focus:outline-none resize-none" rows="3"></textarea>' +
      '<div class="flex items-center gap-2 justify-end mt-2">' +
        '<button onclick="bizNetwork.cancelEditPost(\'' + postId + '\')" class="btn-secondary !py-1.5 !px-3 !text-xs">ยกเลิก</button>' +
        '<button onclick="bizNetwork.saveEditPost(\'' + postId + '\')" class="btn-primary !py-1.5 !px-3 !text-xs">บันทึก</button>' +
      '</div>';

    var ta = document.getElementById('edit-post-' + postId);
    if (ta) {
      ta.value = currentText;
      ta.focus();
      // ให้ cursor ไปท้ายข้อความ
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  function cancelEditPost(postId) {
    var postEl = document.querySelector('[data-post-id="' + postId + '"]');
    if (!postEl) return;
    var contentEl = postEl.querySelector('[data-post-content]');
    if (contentEl && editingContent[postId] != null) {
      contentEl.innerHTML = editingContent[postId];
      delete editingContent[postId];
    }
  }

  async function saveEditPost(postId) {
    var ta = document.getElementById('edit-post-' + postId);
    if (!ta) return;
    var newContent = ta.value.trim();
    if (!newContent) {
      alert('เนื้อหาว่างไม่ได้');
      return;
    }

    // Disable ปุ่ม save/cancel + textarea ระหว่าง async → กัน double-click
    var postEl = document.querySelector('[data-post-id="' + postId + '"]');
    var buttons = postEl ? postEl.querySelectorAll('button') : [];
    buttons.forEach(function (b) { b.disabled = true; });
    ta.disabled = true;
    var saveBtn = postEl && postEl.querySelector('button[onclick*="saveEditPost"]');
    var origLabel = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) saveBtn.textContent = 'กำลังบันทึก...';

    var { error } = await supabaseClient
      .from('posts')
      .update({ content: newContent })
      .eq('id', postId);

    if (error) {
      alert('บันทึกไม่สำเร็จ: ' + window.bizErr(error));
      buttons.forEach(function (b) { b.disabled = false; });
      ta.disabled = false;
      if (saveBtn) saveBtn.textContent = origLabel;
      return;
    }

    delete editingContent[postId];
    loadPosts();
    showToast('แก้ไขแล้ว');
  }

  // ===== Delete Post =====
  async function deletePost(postId) {
    if (!confirm('ลบโพสต์นี้?')) return;

    var { error } = await supabaseClient.from('posts').delete().eq('id', postId);
    if (error) {
      alert('ลบไม่สำเร็จ: ' + window.bizErr(error));
      return;
    }

    loadPosts();
    showToast('ลบโพสต์แล้ว');
  }

  // ===== Filter by Tag (independent from favorites) =====
  function filterTag(tag) {
    currentTag = tag;
    currentPage = 1;
    updateFilterButtons();
    loadPosts();
  }

  // ===== Toggle favorites filter (independent, AND combined with tag) =====
  function filterFavorites() {
    currentFilterMode = currentFilterMode === 'favorites' ? 'all' : 'favorites';
    currentPage = 1;
    updateFilterButtons();
    loadPosts();
  }

  function updateFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      var btnTag = btn.getAttribute('data-filter-tag');
      var btnMode = btn.getAttribute('data-filter-mode');
      var active = false;
      if (btnMode === 'favorites') active = currentFilterMode === 'favorites';
      else if (btnTag != null) active = btnTag === currentTag;
      if (active) {
        btn.classList.remove('text-slate-500', 'hover:bg-slate-50');
        btn.classList.add('bg-primary', 'text-white');
      } else {
        btn.classList.remove('bg-primary', 'text-white');
        btn.classList.add('text-slate-500', 'hover:bg-slate-50');
      }
    });
  }

  // ===== Filter by Province =====
  function filterProvince(province) {
    currentProvince = province === 'ทุกจังหวัด' || !province ? '' : province;
    currentPage = 1;
    loadPosts();
  }

  // ===== Province Searchable Dropdown =====
  function toggleProvinceMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('province-menu');
    if (!menu) return;
    var willShow = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (willShow) {
      renderProvinceList('');
      var search = document.getElementById('province-search');
      if (search) { search.value = ''; setTimeout(function () { search.focus(); }, 0); }
    }
  }

  function closeProvinceMenu() {
    var menu = document.getElementById('province-menu');
    if (menu) menu.classList.add('hidden');
  }

  function renderProvinceList(query) {
    var list = document.getElementById('province-list');
    if (!list) return;
    query = (query || '').trim();
    var filtered = query
      ? PROVINCES.filter(function (p) { return p.indexOf(query) !== -1; })
      : PROVINCES;

    var html = '<button type="button" class="province-option w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-slate-600" data-province="">— ทุกจังหวัด —</button>';
    html += filtered.map(function (p) {
      var isActive = p === currentProvince;
      return '<button type="button" class="province-option w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ' + (isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700') + '" data-province="' + p + '">' + p + '</button>';
    }).join('');

    if (filtered.length === 0) {
      html += '<div class="px-4 py-4 text-xs text-slate-400 text-center">ไม่พบจังหวัด</div>';
    }
    list.innerHTML = html;

    // wire clicks
    list.querySelectorAll('.province-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-province') || '';
        pickProvince(val);
      });
    });
  }

  function pickProvince(value) {
    var labelEl = document.getElementById('province-filter-label');
    if (labelEl) labelEl.textContent = value || 'ทุกจังหวัด';
    closeProvinceMenu();
    filterProvince(value);
  }

  function initProvinceFilter() {
    var search = document.getElementById('province-search');
    if (search) {
      search.addEventListener('input', function () { renderProvinceList(search.value); });
    }
    var postSearch = document.getElementById('post-province-search');
    if (postSearch) {
      postSearch.addEventListener('input', function () { renderPostProvinceList(postSearch.value); });
    }
    // click outside → close ทั้งสอง dropdown
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('province-filter-wrap');
      if (wrap && !wrap.contains(e.target)) closeProvinceMenu();
      var postWrap = document.getElementById('post-province-wrap');
      if (postWrap && !postWrap.contains(e.target)) closePostProvinceMenu();
    });
  }

  // ===== Post form: Province searchable dropdown =====
  function togglePostProvinceMenu(e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('post-province-menu');
    if (!menu) return;
    var willShow = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (willShow) {
      renderPostProvinceList('');
      var search = document.getElementById('post-province-search');
      if (search) { search.value = ''; setTimeout(function () { search.focus(); }, 0); }
    }
  }

  function closePostProvinceMenu() {
    var menu = document.getElementById('post-province-menu');
    if (menu) menu.classList.add('hidden');
  }

  function renderPostProvinceList(query) {
    var list = document.getElementById('post-province-list');
    if (!list) return;
    query = (query || '').trim();
    var filtered = query
      ? PROVINCES.filter(function (p) { return p.indexOf(query) !== -1; })
      : PROVINCES;
    var current = (document.getElementById('post-province') || {}).value || '';

    // ปุ่ม "ไม่ระบุ" บนสุดเสมอ
    var html = '<button type="button" class="post-province-option w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ' + (!current ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-400') + '" data-province="">— ไม่ระบุ —</button>';
    html += filtered.map(function (p) {
      var isActive = p === current;
      return '<button type="button" class="post-province-option w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ' + (isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700') + '" data-province="' + p + '">' + p + '</button>';
    }).join('');
    if (filtered.length === 0 && query) {
      html += '<div class="px-4 py-4 text-xs text-slate-400 text-center">ไม่พบจังหวัด</div>';
    }
    list.innerHTML = html;
    list.querySelectorAll('.post-province-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPostProvince(btn.getAttribute('data-province') || '');
      });
    });
  }

  function setPostProvince(value) {
    var hidden = document.getElementById('post-province');
    var label = document.getElementById('post-province-label');
    if (hidden) hidden.value = value;
    if (label) {
      if (value) {
        label.textContent = value;
        label.classList.remove('text-slate-400');
      } else {
        label.textContent = '— ไม่ระบุ —';
        label.classList.add('text-slate-400');
      }
    }
    closePostProvinceMenu();
  }

  // ===== Pagination =====
  function renderPagination(total) {
    var container = document.getElementById('pagination');
    if (!container) return;

    var totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    var html = '';
    // Prev
    html += '<button onclick="bizNetwork.goPage(' + (currentPage - 1) + ')" ' + (currentPage === 1 ? 'disabled' : '') +
      ' class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400">' +
      '<span class="material-symbols-rounded text-xl">chevron_left</span></button>';

    for (var i = 1; i <= Math.min(totalPages, 5); i++) {
      if (i === currentPage) {
        html += '<button class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">' + i + '</button>';
      } else {
        html += '<button onclick="bizNetwork.goPage(' + i + ')" class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm text-slate-600">' + i + '</button>';
      }
    }

    if (totalPages > 5) {
      html += '<span class="text-slate-400 text-sm px-1">...</span>';
      html += '<button onclick="bizNetwork.goPage(' + totalPages + ')" class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-sm text-slate-600">' + totalPages + '</button>';
    }

    // Next
    html += '<button onclick="bizNetwork.goPage(' + (currentPage + 1) + ')" ' + (currentPage === totalPages ? 'disabled' : '') +
      ' class="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">' +
      '<span class="material-symbols-rounded text-xl">chevron_right</span></button>';

    container.innerHTML = html;
  }

  function goPage(page) {
    if (page < 1) return;
    currentPage = page;
    loadPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===== Helpers =====
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
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML =
      '<span class="material-symbols-rounded text-green-500 text-xl flex-shrink-0" style="font-variation-settings: \'FILL\' 1">check_circle</span>' +
      '<span class="flex-1">' + msg + '</span>';
    toast.classList.remove('hidden');
    // trigger transition after display change
    requestAnimationFrame(function () { toast.classList.add('show'); });
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.classList.add('hidden'); }, 300);
    }, 2500);
  }

  // ===== Expose =====
  window.bizNetwork = {
    createPost: createPost,
    deletePost: deletePost,
    editPost: editPost,
    cancelEditPost: cancelEditPost,
    saveEditPost: saveEditPost,
    filterTag: filterTag,
    filterFavorites: filterFavorites,
    toggleFavorite: toggleFavorite,
    filterProvince: filterProvince,
    goPage: goPage,
    toggleProvinceMenu: toggleProvinceMenu,
    togglePostProvinceMenu: togglePostProvinceMenu
  };

  // ===== Auto Init =====
  document.addEventListener('DOMContentLoaded', init);
})();
