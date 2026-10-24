# لوحة قياس التجربة (SPECS-TRIAL v1.2 — المهمة 3)

أرقام بوابة القياس من أوامر SQL فقط، لا من الذاكرة ولا من لوحات بلا أمر.
تُشغَّل في **SQL Editor** في Supabase بصلاحية المالك (الجداول لا تُقرأ من التطبيق).

**نافذة العدّ:** 2026-10-24 → 2026-11-07 شاملة، بتوقيت الرياض (اعتماد المرجع).

**قاعدة القرار:** تجاوز **بندين من ثلاثة** على الأقل:

| البند | الهدف |
|---|---|
| المسجلون | 10 |
| رفعوا بيانات تدريب فعلية | 5 |
| إشارة شراء (التذكيرات أو السعر) | 3 |

## 1. أرقام البوابة الثلاثة — أمر واحد

```sql
WITH win AS (
  SELECT timestamptz '2026-10-24 00:00+03' AS starts,
         timestamptz '2026-11-08 00:00+03' AS ends
)
SELECT
  (SELECT count(*) FROM public.trial_signups, win
    WHERE created_at >= win.starts AND created_at < win.ends) AS signups,
  (SELECT count(DISTINCT tr.workspace_id)
     FROM public.training_records tr
     JOIN public.workspaces w ON w.id = tr.workspace_id, win
    WHERE w.created_at >= win.starts AND w.created_at < win.ends) AS uploaded_data,
  (SELECT count(*) FROM public.trial_signups, win
    WHERE created_at >= win.starts AND created_at < win.ends
      AND (interest @> '["reminders"]' OR interest @> '["pricing"]')) AS buying_signal;
```

- **signups:** طلبات نموذج `/trial` داخل النافذة.
- **uploaded_data:** مساحات أُنشئت داخل النافذة وفيها سجل تدريب واحد على الأقل. مساحة المالك أُنشئت قبل النافذة فلا تُعدّ.
- **buying_signal:** طلبات اختارت «التذكيرات» أو «السعر». يُضاف إليها يدوياً ما وصل بواتساب أو البريد، مع تسجيل مصدره.

مفاتيح الاهتمام كما يخزنها النموذج: `reminders` / `reports` / `arabic` / `pricing`.

## 2. النشاط اليومي

```sql
SELECT m.workspace_id, max(u.last_sign_in_at) AS last_sign_in
FROM public.workspace_members m
JOIN auth.users u ON u.id = m.user_id
GROUP BY m.workspace_id
ORDER BY last_sign_in DESC NULLS LAST;
```

## 3. تسجيل القراءة

بعد كل قراءة: التاريخ + الأرقام الثلاثة في سجل المتابعة. القراءة الرسمية للقرار يوم **2026-11-08** بعد انتهاء النافذة.
