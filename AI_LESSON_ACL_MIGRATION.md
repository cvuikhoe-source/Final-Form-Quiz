# YEU CAU AI: XOA DU LIEU NGU PHAP + BO FOLDER ACL + CHUYEN SANG LESSON ACL

Hay lam truc tiep tren project hien tai, khong chi phan tich/huong dan. Tu kiem tra source, database, Supabase, RLS, Edge Functions, UI va test. Khong can hoi lai toi.

## 1. Muc tieu

1. Xoa toan bo du lieu Ngu phap hien tai de nhap lai tu dau.
2. Bo hoan toan chuc nang cap quyen theo Folder.
3. Chuyen sang cap quyen truc tiep theo tung Bai hoc (Lesson).
4. Folder chi dung de sap xep bai hoc, khong quyet dinh quyen truy cap.

## 2. Backup va xoa du lieu Ngu phap

Truoc khi xoa:

- Kiem ke Lesson Ngu phap, GrammarItem, bai tap, dap an, progress va du lieu lien quan.
- Export backup JSON hoac SQL vao local.
- Chay dry-run, liet ke ID va so record se xoa.
- Chi xoa sau khi backup day du.

Sau do xoa:

- Lesson thuoc Ngu phap.
- GrammarItem.
- Bai tap, dap an, progress va du lieu phu thuoc chi thuoc Ngu phap.
- Grammar Collection/du lieu thu nghiem cu neu con.
- Grant gan voi cac Lesson Ngu phap bi xoa.

Yeu cau:

- Dung transaction neu co the.
- Khong xoa Folder chi vi Folder tung chua Ngu phap.
- Khong anh huong Tu vung, Nghe hieu, Doc hieu, User, Class, Supabase Auth.
- Sau cleanup, phan Ngu phap phai trong va san sang import lai Excel.
- Khong doi mat khau.

## 3. Bo Folder ACL

Loai bo toan bo chuc nang cap quyen Folder, gom:

- Menu `Quan ly quyen truy cap` cua Folder.
- FolderAccessModal.
- Cap quyen Teacher/Class/Student tren Folder.
- Quyen ke thua Folder.
- `folder_access_grants`.
- `manage-folder-access`.
- `resolveInheritedFolderAccess`.
- owner/manager/editor/viewer cua Folder.
- API/service/type/migration/RLS/test chi phuc vu Folder ACL.

Phai kiem tra dependency truoc khi xoa.

Khong xoa Folder. Folder van duoc dung de:

- Tao.
- Doi ten/mau.
- Di chuyen.
- Luu tru/khoi phuc.
- Xoa theo business rule.
- Chua va sap xep bai hoc.

Khong xoa Folder ACL truoc khi Lesson ACL moi hoat dong va test dat.

## 4. Tao Lesson ACL

Tao he thong `lesson_access_grants` hoac cau truc tuong duong:

- `lesson_id`
- `principal_type`: `user` hoac `class`
- `principal_id`
- `permission`: `owner`, `manager`, `editor`, `viewer`
- `granted_by`
- `created_at`
- `updated_at`

Yeu cau:

- Unique `lesson_id + principal_type + principal_id`.
- Khong grant trung.
- Khong principal invalid.
- Khong de Lesson mat owner ngoai y muon.
- Student khong duoc tu cap quyen.
- Teacher khong duoc tu nang quyen.

## 5. Quyen Admin

Admin:

- Thay tat ca Lesson.
- Tao/sua/xoa/di chuyen Lesson.
- Cap Lesson cho Teacher, Class, Student.
- Thu hoi quyen.
- Chi dinh Teacher thanh owner/manager/editor/viewer.

## 6. Quyen Teacher

Teacher chi thay:

- Lesson Teacher tu tao.
- Lesson duoc Admin cap.

Teacher khong thay Lesson cua Teacher/lop khac neu khong duoc cap.

Teacher duoc:

- Tao Lesson moi.
- Lesson Teacher tao thi Teacher la owner.
- Chon Folder chi de sap xep.
- Sua Lesson theo permission.
- Neu la owner/manager: cap Lesson cho Student hoac Class minh phu trach.
- Thu hoi quyen Student/Class trong pham vi minh phu trach.

Teacher khong duoc:

- Cap bai cho hoc sinh lop khac.
- Xem danh sach hoc sinh lop khac.
- Cap quyen cho Teacher khac.
- Tu nang quyen.
- Quan ly Lesson khong duoc cap.
- Vuot quyen bang cach thay `lessonId`, `studentId`, `classId`.

Mac dinh:

- Teacher tao Lesson = owner.
- Admin cap Teacher de quan ly = manager.
- Admin cap chi de xem = viewer.

## 7. Quyen Student

Student chi thay:

- Lesson duoc cap truc tiep.
- Lesson duoc cap cho Class ma Student thuoc ve.

Student khong duoc:

- Thay bai lop khac.
- Tao/sua/xoa/di chuyen bai.
- Xem grant.
- Goi API cap/thu hoi quyen.
- Truy cap Lesson khong duoc cap bang cach thay ID.

## 8. UI cap quyen Bai hoc

Trong menu `...` cua tung Lesson them:

`Cap quyen bai hoc`

Chi hien cho:

- Admin.
- Teacher owner/manager.

Modal gom:

### Giao vien
- Chi Admin duoc cap quyen cho Teacher.
- Admin co the chon owner/manager/editor/viewer.

### Lop hoc
- Admin thay tat ca Class.
- Teacher chi thay Class minh phu trach.
- Co the cap/thu hoi Lesson cho Class.

### Hoc sinh
- Admin quan ly theo pham vi he thong.
- Teacher chi thay Student trong Class minh phu trach.
- Co tim kiem va cap/thu hoi tung Student.

Modal hien thi ten Lesson, nguoi tao, Teacher/Class/Student dang duoc cap va permission.

## 9. Hien thi Folder va Lesson

Folder khong cap quyen.

- Admin thay tat ca.
- Teacher chi thay Lesson tu tao/duoc cap; Folder chi hien khi co Lesson Teacher duoc xem.
- Student chi thay Lesson duoc cap truc tiep/qua Class; Folder chi hien khi co Lesson Student duoc xem.

Trong cung mot Folder co the co bai cua nhieu lop. Nguoi dung chi thay Lesson duoc cap, khong duoc thay bai khac chi vi cung Folder.

## 10. Tao bai va Import Excel

Teacher duoc tao:

- Ngu phap.
- Tu vung.
- Nghe hieu.
- Doc hieu.

Lesson Teacher tao => Teacher la owner.

### Ngu phap Excel

- 1 file Excel = 1 Lesson.
- Moi hang Excel = 1 GrammarItem ben trong Lesson.
- Khong tao 1 Lesson cho moi hang.

### Tu vung Excel

Giu nguyen:

- 1 file = 1 Lesson.
- Nhieu hang = nhieu VocabularyItem trong Lesson.
- Khong anh huong du lieu va Flashcard hien tai.

## 11. Backend va bao mat

Backend/RLS phai kiem tra:

- JWT + `auth.uid()`.
- Role that trong database.
- Lesson owner + lesson_access_grants.
- Teacher-Class assignment.
- Student-Class membership.

Khong tin `role`, `permission`, `userId`, `teacherId`, `classId` gui tu frontend.

Chan IDOR khi thay:

- lessonId.
- studentId.
- teacherId.
- classId.

Du lieu con phai ke thua quyen tu Lesson cha:

- GrammarItem.
- VocabularyItem.
- Questions.
- Exercises.
- Answers.
- Attachments.
- Progress.

## 12. Thu tu thuc hien

Lam dung thu tu:

1. Kiem ke + backup DB.
2. Dry-run xoa Ngu phap.
3. Tao Lesson ACL + migration + API/RLS.
4. Tao UI `Cap quyen bai hoc`.
5. Chuyen danh sach Lesson sang loc theo Lesson ACL.
6. Test Admin/Teacher/Student.
7. Xoa du lieu Ngu phap sau khi backup dat.
8. Xac minh Ngu phap trong.
9. Loai bo Folder ACL khoi source local.
10. Chuan bi migration/Edge Function can thiet nhung CHUA deploy production.

## 13. Test bat buoc

Kiem tra toi thieu:

1. Admin thay tat ca va cap quyen duoc.
2. Teacher chi thay bai tu tao/duoc cap.
3. Teacher tao Lesson va tro thanh owner.
4. Teacher owner/manager cap bai cho hoc sinh/lop minh.
5. Teacher khong cap duoc cho lop khac.
6. Student chi thay bai duoc cap truc tiep/qua Class.
7. Student lop khac bi chan.
8. Thay lessonId bi backend/RLS chan.
9. Hai Lesson cung Folder co the cap cho hai lop khac nhau.
10. Folder khong tu dong cap quyen.
11. Khong con UI/API Folder ACL.
12. Ngu phap sau cleanup = 0.
13. Tu vung/Nghe/Doc con nguyen.
14. Import Ngu phap: 1 file -> 1 Lesson -> N GrammarItem.
15. Teacher khong thay bai hoc cua lop/Teacher khac.

Chay:

```bash
npm run typecheck
npm run lint
npm run build
```

Chay them tat ca test Lesson ACL, RLS, import va regression hien co.

Khong bao PASS neu process timeout/killed/cancelled hoac khong co exit code cuoi.

## 14. Gioi han

- Khong reset toan database.
- Khong xoa Tu vung/Nghe/Doc.
- Khong xoa User/Class.
- Khong doi/reset mat khau.
- Khong reset Supabase Auth.
- Khong `git reset --hard`.
- Khong `git clean -fd`.
- Khong commit.
- Khong push.
- Khong deploy frontend.
- Khong deploy Edge Function.
- Khong chay migration production.
- Khong dung localStorage de gia lap ket qua.

## 15. Bao cao cuoi

Bao cao:

1. Du lieu Ngu phap truoc/sau cleanup.
2. Vi tri backup + so record.
3. Code Folder ACL da loai bo.
4. Schema Lesson ACL moi.
5. Quyen Admin/Teacher/Student.
6. Cach gioi han Teacher theo lop.
7. Ket qua IDOR/security.
8. Ket qua typecheck/lint/build + exit code that.
9. So test pass/fail.
10. Migration/Edge Function con cho deploy.
11. `git diff --stat`.
12. Xac nhan khong mat du lieu ngoai Ngu phap.
13. Xac nhan khong doi mat khau.
14. Xac nhan khong commit/push/deploy.

Chi ket luan HOAN THANH khi Lesson ACL bao ve ca frontend va backend/RLS, Teacher khong thay bai hoc cua lop khac, va du lieu Ngu phap da duoc backup + cleanup dung yeu cau.

Hay bat dau ngay. Khong xoa du lieu truoc khi backup va dry-run hoan tat.
