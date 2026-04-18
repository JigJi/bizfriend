/* ============================================
   bizfriend - Supabase Client
   ============================================ */

// Environment detection — localhost → local Supabase (Docker), else → cloud production
const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const SUPABASE_URL = IS_LOCAL
  ? 'http://127.0.0.1:54321'
  : 'https://liqjwpiypsvuyzxnydbu.supabase.co';

const SUPABASE_ANON_KEY = IS_LOCAL
  ? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpcWp3cGl5cHN2dXl6eG55ZGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODE5MDAsImV4cCI6MjA4OTc1NzkwMH0.OgC554g98_A-pfjCjw53atGxtW1vAza5BxvgdcE9qtI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('[FriendTa] env:', IS_LOCAL ? 'LOCAL (test)' : 'PRODUCTION', '→', SUPABASE_URL);

// แปล error จาก Supabase เป็นภาษาไทย (fallback เป็นข้อความเดิมถ้าไม่รู้จัก)
var BIZ_ERR_MAP = {
  'invalid_credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'user already registered': 'อีเมลนี้มีบัญชีอยู่แล้ว',
  'user_already_exists': 'อีเมลนี้มีบัญชีอยู่แล้ว',
  'email not confirmed': 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ',
  'email_not_confirmed': 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ',
  'email rate limit exceeded': 'ส่งคำขอบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  'over_email_send_rate_limit': 'ส่งคำขอบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  'over_request_rate_limit': 'ส่งคำขอบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  'password should be at least 6 characters': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว',
  'password should be at least 6 characters.': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว',
  'weak_password': 'รหัสผ่านไม่ปลอดภัยพอ ลองเพิ่มความยาวหรือใช้ตัวอักษรหลากหลาย',
  'new password should be different from the old password': 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม',
  'new password should be different from the old password.': 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม',
  'same_password': 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม',
  'token has expired or is invalid': 'ลิงก์หมดอายุหรือไม่ถูกต้อง',
  'jwt expired': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  'session_not_found': 'ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่',
  'user not found': 'ไม่พบผู้ใช้นี้',
  'user_not_found': 'ไม่พบผู้ใช้นี้',
  'invalid email': 'รูปแบบอีเมลไม่ถูกต้อง',
  'email_address_invalid': 'รูปแบบอีเมลไม่ถูกต้อง',
  'unable to validate email address: invalid format': 'รูปแบบอีเมลไม่ถูกต้อง',
  'signup requires a valid password': 'กรุณากรอกรหัสผ่าน',
  'signup_disabled': 'ขณะนี้ปิดการสมัครสมาชิก',
  'database error saving new user': 'เกิดข้อผิดพลาดขณะสร้างบัญชี กรุณาลองใหม่',
  'user_banned': 'บัญชีนี้ถูกระงับการใช้งาน',
  'captcha failed': 'ตรวจสอบ captcha ไม่สำเร็จ',
  'failed to fetch': 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต',
  'network request failed': 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต',
  'not authenticated': 'กรุณาเข้าสู่ระบบ',
  'permission denied': 'ไม่มีสิทธิ์ทำรายการนี้',
  'blocked': 'ไม่สามารถสนทนากับผู้ใช้นี้ได้',
  'cannot block self': 'บล็อกตัวเองไม่ได้',
  'cannot create conversation with self': 'สร้างการสนทนากับตัวเองไม่ได้',
  'target user not found': 'ไม่พบผู้ใช้ปลายทาง',
};

window.bizErr = function (e) {
  if (!e) return '';
  var msg = typeof e === 'string' ? e : (e.message || '');
  var code = typeof e === 'object' ? (e.code || e.error_code || '') : '';
  var keyCode = String(code).toLowerCase().trim();
  var keyMsg = String(msg).toLowerCase().trim();
  return BIZ_ERR_MAP[keyCode] || BIZ_ERR_MAP[keyMsg] || msg || 'เกิดข้อผิดพลาด';
};

// Shared session + profile cache — call once, reuse everywhere
var _bizSessionPromise = null;
var _bizProfileCache = {};

window.bizGetSession = function () {
  if (!_bizSessionPromise) {
    _bizSessionPromise = supabaseClient.auth.getSession().then(function (r) { return r.data.session; });
  }
  return _bizSessionPromise;
};

// Invalidate on auth state change so next call fetches fresh
supabaseClient.auth.onAuthStateChange(function () {
  _bizSessionPromise = null;
  _bizProfileCache = {};
});

window.bizGetProfile = function (userId) {
  if (_bizProfileCache[userId]) return Promise.resolve(_bizProfileCache[userId]);
  return supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
    .then(function (r) {
      if (r.data) _bizProfileCache[userId] = r.data;
      return r.data;
    });
};
