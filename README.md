# GlowFit Web

هذا الريبو فيه صفحة الهبوط ولوحة التحكم الخاصتين بـ GlowFit AI.

## البنية

- `landing/` — صفحة الهبوط العامة (index.html + privacy-policy.html) — تُنشر على الدومين الرئيسي (مثلاً glowfitai.com)
- `admin/` — لوحة التحكم (مبنية بـ HTML/JS بسيط، متصلة مباشرة بـ Supabase) — تُنشر على subdomain منفصل (مثلاً admin.glowfitai.com)

## النشر (Vercel)

كل مجلد يُنشر كمشروع Vercel منفصل بنفس هذا الريبو، مع تحديد "Root Directory":
- مشروع 1: Root Directory = `landing`
- مشروع 2: Root Directory = `admin`
