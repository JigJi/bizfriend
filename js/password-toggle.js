/* ============================================
   bizfriend - Password show/hide toggle
   Auto-enhance: ค้นหา <input type="password"> ทุกช่อง
   แล้วเพิ่มไอคอนตา (visibility) กด toggle type=text/password
   ============================================ */

(function () {
  'use strict';

  function enhance(input) {
    if (input.dataset.pwToggled) return;
    input.dataset.pwToggled = '1';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.paddingRight = '44px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'แสดง/ซ่อนรหัสผ่าน');
    btn.tabIndex = -1;
    btn.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:0;cursor:pointer;padding:6px;color:#94a3b8;display:flex;align-items:center;border-radius:8px;';
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:20px;">visibility</span>';
    btn.addEventListener('mouseenter', function () { btn.style.color = '#475569'; });
    btn.addEventListener('mouseleave', function () { btn.style.color = '#94a3b8'; });
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      var icon = btn.querySelector('span');
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility';
      }
    });
  }

  function run() {
    document.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
