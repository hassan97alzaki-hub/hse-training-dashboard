# دليل تشغيل التجربة السحابية (SPECS-TRIAL v1.2)

خطوات يدوية للمالك من لوحة Supabase. كل أمر هنا يُشغَّل في **SQL Editor** بصلاحية المالك.
لا يُنسخ أي بريد أو اسم عميل إلى هذا الملف أو إلى git.

قاعدة واحدة تحكم كل ما يلي: `workspaces.trial_ends_at = NULL` يعني «ليست تجربة» ولا تُجمَّد أبداً.
هذا يحمي مساحة المالك وكل مساحة أُنشئت قبل التجربة.

---

## 0. إغلاق التسجيل الذاتي (مرة واحدة)

التطبيق لم يعد يعرض «إنشاء حساب»، ورابط الدخول بالبريد لا ينشئ حساباً جديداً.
لكن المنع الفعلي إعداد في المشروع نفسه، لأن أي شخص يملك المفتاح العام يستطيع استدعاء التسجيل مباشرة:

1. لوحة Supabase ← **Authentication** ← **Sign In / Providers**.
2. أطفئ **Allow new users to sign up** واحفظ.
3. تحقّق: افتح `/app` في نافذة خاصة؛ لا يوجد خيار إنشاء حساب، ورابط الدخول لبريد غير مسجّل لا يُدخل أحداً.

إضافة المستخدمين من **Add user** تبقى تعمل بعد الإغلاق، وهي الطريق الوحيد لإنشاء حساب.

## 1. إنشاء حساب تجريبي — تلقائي (قرار المالك 2026-10-25)

لا إجراء يدوي. العميل يملأ نموذج `/trial` ويختار كلمة مرور، فتنفّذ الدالة `trial-signup` على Supabase:

1. إنشاء المستخدم مؤكَّداً (`email_confirm`، بلا رسالة بريد حتى شراء النطاق).
2. `provision_trial()` في معاملة واحدة: المساحة بنهاية منتصف ليل الرياض بعد 7 أيام، العضوية owner، صف `trial_signups`.
3. دخول مباشر إلى `/app`.

- **السقف:** 20 مساحة تجريبية (`trial_slots_left()`). بعدها يُسجَّل الطلب في `trial_signups` ويظهر للزائر «قائمة الانتظار» دون إنشاء حساب.
- **التنبيه:** كل حساب جديد وكل دخول لقائمة الانتظار يصلك بالبريد (Resend، من `onboarding@resend.dev`)، والعنوان يحمل «إشارة شراء» إن اختار العميل السعر أو التذكيرات. يعمل بسرّين في الدالة: `npx supabase secrets set RESEND_API_KEY=… NOTIFY_EMAIL=…`، ويجب أن يكون `NOTIFY_EMAIL` بريد حساب Resend نفسه. تعطّل البريد لا يوقف التسجيل.
- **دورك:** رسالة ترحيب بواتساب لكل مسجّل جديد فور وصول التنبيه، ولا شيء غيرها.
- **النشر:** بعد أي تعديل على الدالة: `npx supabase functions deploy trial-signup --no-verify-jwt`.

**احتياط يدوي** (إن تعطلت الدالة): Add user ثم:

```sql
DO $$
DECLARE uid UUID := (SELECT id FROM auth.users WHERE email = '<البريد>');
BEGIN
  PERFORM public.provision_trial(uid, '<اسم الشركة>', '<البريد>', NULL, NULL, NULL, '[]'::jsonb, '/ar');
END $$;
```

## 2. حالة كل التجارب

```sql
SELECT w.name, u.email,
       to_char(w.trial_ends_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') AS ends_riyadh,
       CASE WHEN w.trial_ends_at <= now() THEN 'frozen' ELSE 'active' END AS state
FROM public.workspaces w
JOIN public.workspace_members m ON m.workspace_id = w.id AND m.role = 'owner'
JOIN auth.users u ON u.id = m.user_id
WHERE w.trial_ends_at IS NOT NULL
ORDER BY w.trial_ends_at;
```

التذكير يوم 5 (الرسالة 3) لمن `ends_riyadh` بعد يومين، ورسالة الانتهاء (الرسالة 4) لمن صار `frozen` اليوم.

## 3. ما يحدث عند الانتهاء (المهمة 2)

- **التجميد تلقائي** عند `trial_ends_at`، بساعة قاعدة البيانات لا ساعة الجهاز. لا يحتاج أي إجراء.
- القاعدة ترفض الإضافة والتعديل والحذف على **جداول بيانات التدريب التسعة كلها** (السجلات، المتطلبات، الموظفون، الدورات، الأقسام، الشهادات، جهات الاتصال، سجل التذكيرات، اعتماد المتطلبات) من أي مصدر، بما فيه REST المباشر.
- القراءة تبقى، فيستطيع العميل التصدير من زر **Export CSV** في التطبيق متى شاء.
- العميل لا يستطيع تغيير `trial_ends_at` بنفسه: العمود الوحيد الذي يعدّله العميل في `workspaces` هو الاسم.
- **30 يوماً** من التجميد ثم حذف بعد تأكيد تسليم التصدير. الحذف جراحة SQL على بيانات عميل:
  **يُرفع للمرجع قبل التنفيذ** ولا يُكتب أمره هنا.

## 4. تمديد تجربة (بقرار المالك فقط)

```sql
UPDATE public.workspaces
SET trial_ends_at = trial_ends_at + interval '<عدد> days'
WHERE id = '<workspace id>';
```

## 5. إثبات التجميد على المشروع الحي

بحساب اختبار فقط، لا حساب عميل. أنهِ تجربته وأضف له سجلاً ومتطلباً، ثم:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=<publishable> \
TRIAL_EMAIL=... TRIAL_PASSWORD=... npm run verify:freeze
```

التعليمات الكاملة في رأس `scripts/verify-trial-freeze.mjs`. النتيجة المطلوبة: كل البنود `pass`.
احذف حساب الاختبار بعدها.
