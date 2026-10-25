# لوحة قياس التجربة (SPECS-TRIAL v1.4 — المهمة 3)

أرقام بوابة القياس من أوامر SQL فقط، لا من الذاكرة ولا من لوحات بلا أمر.
تُشغَّل في **SQL Editor** في Supabase بصلاحية المالك (الجداول لا تُقرأ من التطبيق).

**نافذة العدّ (SPECS v1.4):** 2026-10-25 → 2026-11-07 شاملة، بتوقيت الرياض. القراءة الرسمية صباح 2026-11-08. تسجيلات 2026-10-24 تُحتسب في «المسجلين» فقط.

**قاعدة القرار:** تجاوز **بندين من ثلاثة** على الأقل:

| البند | الهدف |
|---|---|
| المسجلون | 10 |
| رفعوا بيانات تدريب فعلية | 5 |
| إشارة شراء (التذكيرات أو السعر) | 3 |

## 1. أرقام البوابة الثلاثة — أمر واحد

```sql
WITH win AS (
  SELECT timestamptz '2026-10-25 00:00+03' AS starts,
         timestamptz '2026-11-08 00:00+03' AS ends,
         timestamptz '2026-10-24 00:00+03' AS signups_from
)
SELECT
  (SELECT count(*) FROM public.trial_signups, win
    WHERE created_at >= win.signups_from AND created_at < win.ends) AS signups,
  (SELECT count(*) FROM public.workspaces w, win
    WHERE w.last_import_at >= win.starts AND w.last_import_at < win.ends
      AND w.trial_ends_at IS NOT NULL) AS uploaded_data,
  (SELECT count(*) FROM public.trial_signups, win
    WHERE created_at >= win.starts AND created_at < win.ends
      AND (interest @> '["reminders"]' OR interest @> '["pricing"]')) AS buying_signal;
```

- **signups:** طلبات نموذج `/trial` من 2026-10-24 (يوم نشر النموذج الحي) حتى نهاية النافذة.
- **uploaded_data:** مساحات تجريبية سجّلت استيراداً ناجحاً داخل النافذة — مؤشر R-1 (`workspaces.last_import_at`). تُسجَّل **واقعة** الاستيراد وعدد صفوفه فقط، لا بيانات الموظفين. `trial_ends_at IS NOT NULL` يستبعد مساحة المالك. من استورد قبل تفعيل المؤشر يُستكمل سؤالاً يدوياً مع تسجيل المصدر.
- **buying_signal:** طلبات اختارت «التذكيرات» أو «السعر» داخل النافذة. يُضاف إليها يدوياً ما وصل بواتساب أو البريد، مع تسجيل مصدره.

**تاريخ تفعيل مؤشر R-1:** يوم تطبيق migration ‏`20261025150000_workspace-last-import.sql` على Supabase ونشر الواجهة التي تستدعي `record_import()` — يُدوَّن هنا عند حدوثه.

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
