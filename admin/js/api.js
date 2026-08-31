// =============================================
// GlowFit Admin - API Configuration
// =============================================

const SUPABASE_URL = 'https://ojaxkhkbyfkcwgavxihq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qYXhraGtieWZrY3dnYXZ4aWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTIxNjQsImV4cCI6MjA5MzIyODE2NH0.g5fsf1h9nQ1E3XpBCKMIVkVb7lMCp0uUc5SLUEdNZpM';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qYXhraGtieWZrY3dnYXZ4aWhxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY1MjE2NCwiZXhwIjoyMDkzMjI4MTY0fQ.9du_AdtPCbyHp3-SLE3Aa9ecq0BAj9W_5vsM68AffDA';

// =============================================
// Helper - طلب API
// =============================================
async function apiRequest(endpoint, options = {}) {
    await ensureFreshToken();
    const token = localStorage.getItem('admin_token');
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
    };

    let response = await fetch(`${SUPABASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    // لو رجع 401 رغم كل شي (مثلاً الـ token انسحب من السيرفر) - جرّب تجديد مرة وحدة وأعد المحاولة
    if (response.status === 401 && localStorage.getItem('admin_refresh_token')) {
        const refreshed = await refreshAccessToken().catch(() => false);
        if (refreshed) {
            const newToken = localStorage.getItem('admin_token');
            response = await fetch(`${SUPABASE_URL}${endpoint}`, {
                ...options,
                headers: { ...headers, 'Authorization': `Bearer ${newToken}` }
            });
        }
    }

    if (!response.ok) {
        if (response.status === 401) {
            // فشل تسجيل الدخول نهائياً - رجّع المستخدم لصفحة الدخول
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_refresh_token');
            localStorage.removeItem('admin_token_expires_at');
            localStorage.removeItem('admin_user');
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage !== 'login.html') {
                window.location.href = 'login.html';
            }
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error_description || 'حدث خطأ في الطلب');
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

// --- تجديد الـ token قبل ما ينتهي، أو إذا كان منتهي أصلاً ---
async function ensureFreshToken() {
    const expiresAt = Number(localStorage.getItem('admin_token_expires_at') || 0);
    const hasToken = !!localStorage.getItem('admin_token');
    const hasRefresh = !!localStorage.getItem('admin_refresh_token');
    // لسا في وقت كافي (أكثر من 60 ثانية) قبل الانتهاء - ما في داعي نجدد
    if (hasToken && expiresAt - Date.now() > 60000) return;
    if (!hasRefresh) return; // ما في شي نجدد منه، خلي الطلب يفشل ويوديه عالـ login
    await refreshAccessToken().catch(() => {});
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('admin_refresh_token');
    if (!refreshToken) throw new Error('لا يوجد refresh token');

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
        throw new Error('تعذّر تجديد الجلسة');
    }

    const data = await response.json();
    localStorage.setItem('admin_token', data.access_token);
    localStorage.setItem('admin_refresh_token', data.refresh_token);
    localStorage.setItem('admin_token_expires_at', String(Date.now() + (data.expires_in * 1000)));
    return true;
}

// =============================================
// GlowFit API Object
// =============================================
window.GlowFitAPI = {

    // --- Auth ---
    async signIn(email, password) {
        const data = await apiRequest('/auth/v1/token?grant_type=password', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        localStorage.setItem('admin_token', data.access_token);
        localStorage.setItem('admin_refresh_token', data.refresh_token);
        localStorage.setItem('admin_token_expires_at', String(Date.now() + (data.expires_in * 1000)));
        localStorage.setItem('admin_user', JSON.stringify(data.user));
        return data;
    },

    async signUp(email, password, profile = {}) {
        const data = await apiRequest('/auth/v1/signup', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                data: profile
            })
        });
        return data;
    },

    signOut() {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh_token');
        localStorage.removeItem('admin_token_expires_at');
        localStorage.removeItem('admin_user');
        localStorage.removeItem('admin_role');
        window.location.href = 'login.html';
    },

    isLoggedIn() {
        const hasSession = !!localStorage.getItem('admin_token') || !!localStorage.getItem('admin_refresh_token');
        const role = localStorage.getItem('admin_role');
        return hasSession && (role === 'admin' || role === 'staff');
    },

    // يتحقق من صلاحية الحساب بعد تسجيل الدخول مباشرة (يستدعى من login.html)
    async verifyStaffAccess() {
        const user = this.getAdminUser();
        if (!user) throw new Error('لا يوجد مستخدم مسجل دخول');
        const rows = await apiRequest(`/rest/v1/profiles?select=role&id=eq.${user.id}`);
        const role = rows && rows[0] ? rows[0].role : 'user';
        if (role !== 'admin' && role !== 'staff') {
            this.signOut();
            throw new Error('هذا الحساب غير مخوّل بالدخول للوحة التحكم');
        }
        localStorage.setItem('admin_role', role);
        return role;
    },

    getAdminUser() {
        const user = localStorage.getItem('admin_user');
        return user ? JSON.parse(user) : null;
    },

    // --- الحساب الشخصي للأدمن الحالي ---
    async getMyProfile() {
        const user = this.getAdminUser();
        if (!user) throw new Error('لا يوجد مستخدم مسجل دخول');
        const rows = await apiRequest(`/rest/v1/profiles?select=*&id=eq.${user.id}`);
        return rows && rows[0] ? rows[0] : null;
    },

    async updateMyProfile(fields) {
        const user = this.getAdminUser();
        if (!user) throw new Error('لا يوجد مستخدم مسجل دخول');
        return await apiRequest(`/rest/v1/profiles?id=eq.${user.id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify(fields)
        });
    },

    // يتأكد من كلمة المرور الحالية (بمحاولة تسجيل دخول صامتة)، وبعدين يغيّرها
    async changeMyPassword(currentPassword, newPassword) {
        const user = this.getAdminUser();
        if (!user || !user.email) throw new Error('تعذّر التحقق من الحساب');

        // تحقق من كلمة المرور الحالية
        const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: currentPassword })
        });
        if (!verifyRes.ok) throw new Error('كلمة المرور الحالية غير صحيحة');

        // غيّر كلمة المرور فعلياً
        await ensureFreshToken();
        const token = localStorage.getItem('admin_token');
        const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword })
        });
        if (!updateRes.ok) {
            const err = await updateRes.json().catch(() => ({}));
            throw new Error(err.message || 'فشل تغيير كلمة المرور');
        }
        return true;
    },

    // --- إدارة فريق العمل (Staff / Admin) ---
    async getStaffMembers() {
        return await apiRequest(
            `/rest/v1/profiles?select=id,full_name,email,role,permissions,created_at&role=in.(admin,staff)&order=created_at.desc`
        );
    },

    async createStaffMember(email, password, fullName, role, permissions = []) {
        const created = await this.adminCreateUser(email, password, { full_name: fullName });
        const newUserId = created && created.id ? created.id : (created && created.user ? created.user.id : null);
        if (!newUserId) throw new Error('تعذّر الحصول على معرّف المستخدم الجديد');

        // ننتظر لحظة صغيرة لإتاحة فرصة لأي trigger ينشئ صف profiles تلقائياً
        await new Promise(r => setTimeout(r, 400));

        // upsert: يشتغل سواء انعمل الصف تلقائياً أو لأ
        return await apiRequest(`/rest/v1/profiles?on_conflict=id`, {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
                id: newUserId,
                email: email,
                full_name: fullName,
                role: role,
                permissions: permissions
            })
        });
    },

    async updateStaffMember(id, { role, permissions }) {
        const payload = {};
        if (role !== undefined) payload.role = role;
        if (permissions !== undefined) payload.permissions = permissions;
        return await apiRequest(`/rest/v1/profiles?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify(payload)
        });
    },

    async removeStaffMember(id) {
        return await this.updateStaffMember(id, { role: 'user', permissions: [] });
    },

    // --- Users ---
    async getUsers(page = 1, limit = 10, search = '', skinFilter = '') {
        const offset = (page - 1) * limit;
        let endpoint = `/rest/v1/profiles?select=*&is_deleted=eq.false&order=created_at.desc&limit=${limit}&offset=${offset}`;
        if (search) {
            endpoint += `&or=(full_name.ilike.*${search}*,email.ilike.*${search}*)`;
        }
        if (skinFilter) {
            endpoint += `&skin_type=eq.${skinFilter}`;
        }
        return await apiRequest(endpoint);
    },

    async getUsersCount() {
        const data = await apiRequest('/rest/v1/profiles?select=count()&is_deleted=eq.false', {
            headers: { 'Prefer': 'count=exact', 'Range': '0-0' }
        });
        return data;
    },

    async updateUser(userId, updates) {
        return await apiRequest(`/rest/v1/profiles?id=eq.${userId}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(updates)
        });
    },

    // --- Products ---
    async getProducts(page = 1, limit = 10, category = '') {
        const offset = (page - 1) * limit;
        let endpoint = `/rest/v1/products?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
        if (category) {
            endpoint += `&category=eq.${category}`;
        }
        return await apiRequest(endpoint);
    },

    async addProduct(product) {
        return await apiRequest('/rest/v1/products', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(product)
        });
    },

    async updateProduct(productId, updates) {
        return await apiRequest(`/rest/v1/products?id=eq.${productId}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(updates)
        });
    },

    async deleteProduct(productId) {
        return await apiRequest(`/rest/v1/products?id=eq.${productId}`, {
            method: 'DELETE'
        });
    },

    // --- Orders ---
    async getOrders(page = 1, limit = 10, status = '') {
        const offset = (page - 1) * limit;
        let endpoint = `/rest/v1/orders?select=*,profiles(full_name,email)&order=created_at.desc&limit=${limit}&offset=${offset}`;
        if (status) {
            endpoint += `&status=eq.${status}`;
        }
        return await apiRequest(endpoint);
    },

    async updateOrderStatus(orderId, status) {
        return await apiRequest(`/rest/v1/orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ status })
        });
    },

    // --- Stats للـ Dashboard ---
    async getDashboardStats() {
        const [users, products, orders, scans] = await Promise.all([
            apiRequest('/rest/v1/profiles?select=count()', { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } }),
            apiRequest('/rest/v1/products?select=count()', { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } }),
            apiRequest('/rest/v1/orders?select=count()', { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } }),
            apiRequest('/rest/v1/skin_scans?select=count()', { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } }),
        ]);
        return { users, products, orders, scans };
    },

    // --- Skin Scans ---
    async getSkinScans(page = 1, limit = 10) {
        const offset = (page - 1) * limit;
        return await apiRequest(
            `/rest/v1/skin_scans?select=*,profiles(full_name)&order=created_at.desc&limit=${limit}&offset=${offset}`
        );
    },

    // --- Chat Messages ---
    async getChatMessages(userId) {
        return await apiRequest(
            `/rest/v1/chat_messages?select=*&user_id=eq.${userId}&order=created_at.asc`
        );
    },

    // --- Upload Avatar ---
    // --- Waitlist ---
    async getWaitlist(page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        return await apiRequest(
            `/rest/v1/waitlist?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`
        );
    },

    async getWaitlistCount() {
        return await apiRequest('/rest/v1/waitlist?select=count()', {
            headers: { 'Prefer': 'count=exact', 'Range': '0-0' }
        });
    },

    // --- Page Views (تتبع زيارات صفحة الهبوط) ---
    async getPageViewsCount(sinceDays = 30) {
        const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
        return await apiRequest(
            `/rest/v1/page_views?select=count()&created_at=gte.${since}`,
            { headers: { 'Prefer': 'count=exact', 'Range': '0-0' } }
        );
    },

    async getPageViewsDaily() {
        return await apiRequest('/rest/v1/page_views_daily?select=*&order=day.desc&limit=14');
    },

    // --- Contact Messages (رسائل تواصل معنا) ---
    async getContactMessages(page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        return await apiRequest(
            `/rest/v1/contact_messages?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`
        );
    },

    async markContactMessageRead(id) {
        return await apiRequest(`/rest/v1/contact_messages?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({ is_read: true })
        });
    },

    // --- Site Content (محتوى قابل للتعديل مثل سياسة الخصوصية) ---
    async getSiteContent(key) {
        const rows = await apiRequest(`/rest/v1/site_content?select=*&key=eq.${key}`);
        return rows && rows[0] ? rows[0] : null;
    },

    async updateSiteContent(key, content) {
        return await apiRequest(`/rest/v1/site_content?key=eq.${key}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({ content, updated_at: new Date().toISOString() })
        });
    },

    async uploadAvatar(userId, file) {
        await ensureFreshToken();
        const token = localStorage.getItem('admin_token');
        const response = await fetch(
            `${SUPABASE_URL}/storage/v1/object/avatars/${userId}/avatar.jpg`,
            {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': file.type,
                    'x-upsert': 'true'
                },
                body: file
            }
        );
        if (!response.ok) throw new Error('فشل رفع الصورة');
        return `${SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/avatar.jpg`;
    }
};

// =============================================
// Auth Guard - حماية الصفحات
// =============================================
(function() {
    const publicPages = ['login.html'];
    const currentPage = window.location.pathname.split('/').pop() || 'Main_Overview.html';
    if (!publicPages.includes(currentPage) && !window.GlowFitAPI.isLoggedIn()) {
        window.location.href = 'login.html';
    }
})();

// =============================================
// Admin Functions - تستخدم service_role key
// ⚠️ تحذير: هاد الكود لازم ينتقل لـ Supabase Edge Function
// قبل الإطلاق الرسمي. الـ service_role key ما إلها مكان
// بكود client-side لأنها بتتخطى كل حماية RLS.
// =============================================
window.GlowFitAPI.adminCreateUser = async function(email, password, profile = {}) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: profile
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'فشل إنشاء المستخدم');
    }

    const data = await response.json();

    // نحدث الـ profile بالبيانات الإضافية
    if (data.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                full_name: profile.full_name,
                skin_type: profile.skin_type,
                email: email
            })
        });
    }

    return data;
};

// =============================================
// تعبئة اسم الأدمن الحقيقي بأعلى كل صفحة (بدل الاسم الوهمي الثابت)
// =============================================
document.addEventListener('DOMContentLoaded', function () {
    const nameEl = document.getElementById('header-admin-name');
    if (!nameEl) return;
    const cachedUser = window.GlowFitAPI.getAdminUser();
    if (cachedUser && cachedUser.user_metadata && cachedUser.user_metadata.full_name) {
        nameEl.innerText = cachedUser.user_metadata.full_name;
    }
    window.GlowFitAPI.getMyProfile()
        .then(profile => {
            if (profile && profile.full_name) nameEl.innerText = profile.full_name;
        })
        .catch(() => {});
});
