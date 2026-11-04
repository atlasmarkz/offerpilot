-- 隐私：姓名、手机、邮箱等个人身份和联系信息只保存在用户本机，不再保存在云端。可重复运行。
-- 清掉已经上传过的在线简历联系方式，以及云端画像里的姓名。教育、经历、技能等内容不受影响。

update resume_doc set data = data - 'contact' where data ? 'contact';
update resume set data = data - 'contact' where data ? 'contact';
update user_data set profile = profile - 'name' where profile ? 'name';

notify pgrst, 'reload schema';
