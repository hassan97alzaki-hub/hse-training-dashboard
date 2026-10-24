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

## 1. إنشاء حساب تجريبي (المهمة 1)

1. Authentication ← Add user: البريد من `trial_signups`، كلمة مرور مؤقتة.
2. **قبل** أن يسجّل العميل دخوله، أنشئ مساحته وابدأ عدّاد الأيام السبعة. هذا الترتيب مهم:
   أول دخول بلا مساحة يُنشئ مساحة عادية (`NULL`) لا تنتهي.

```sql
DO $$
DECLARE
  account_email TEXT := '<البريد من trial_signups>';
  company TEXT := '<اسم الشركة>';
  uid UUID;
  ws UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = account_email;
  IF uid IS NULL THEN RAISE EXCEPTION 'No account for %', account_email; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Account % already has a workspace', account_email;
  END IF;
  -- نهاية التجربة: منتصف ليل الرياض في بداية اليوم الثامن، فاليوم الحالي هو اليوم الأول.
  INSERT INTO public.workspaces (name, trial_ends_at)
  VALUES (company, (((now() AT TIME ZONE 'Asia/Riyadh')::date + 7)::timestamp AT TIME ZONE 'Asia/Riyadh'))
  RETURNING id INTO ws;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (ws, uid, 'owner');
  RAISE NOTICE 'Workspace % — trial ends % (Riyadh)', ws,
    (SELECT trial_ends_at AT TIME ZONE 'Asia/Riyadh' FROM public.workspaces WHERE id = ws);
END $$;
```

3. أرسل بيانات الدخول بالرسالة 2 من SPECS (واتساب يدوياً).
4. الحد الأقصى 20 حساباً تجريبياً؛ بعدها قائمة انتظار.

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
- القاعدة ترفض الإضافة والتعديل والحذف على `training_records` و`requirements` من أي مصدر، بما فيه REST المباشر.
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
