# 雪烬电竞 · 订单小票工坊

一个基于订单号唯一 key 的静态订单与服务管理网页，包含：

- 订单通知解析与订单小票生成
- 生成小票时自动创建独立服务房间
- 保底、撤离率、服务操作和陪陪修改记录
- 结单评价与结单小票 PNG 保存
- 房间后台、网页链接、日志查看、日志清理和房间管理

## 页面入口

- `index.html`：订单小票工坊
- `xuejin-ops-center-260808.html`：私有房间后台入口（需要密码）
- `room.html?orderId=...`：独立服务房间
- `settlement.html?orderId=...`：结单小票

## 腾讯云 CloudBase 部署与实时同步

网页已经接入 CloudBase 数据层。默认 `cloudbase-config.js` 关闭云端模式，所以未配置腾讯云时仍会使用浏览器本地数据；配置后，订单、小票数据、服务房间、服务日志、结单评价和后台房间目录都会从 CloudBase 读取，并通过实时监听同步到其他用户。

1. 在腾讯云 CloudBase 创建环境，并开启“身份认证 > 登录方式 > 匿名登录”。
2. 创建文档型数据库集合 `xuejin_rooms`，权限建议设置为“已登录用户可读写”（匿名登录用户也属于已登录用户）。不要把数据库设置成完全公开读写。
3. 在“API 密钥管理”生成发布密钥。发布密钥可以放在网页端；腾讯云 SecretId、SecretKey、后台密码等私密信息不能放进网页文件。
4. 把环境 ID、发布密钥填入 `cloudbase-config.js`：

```js
window.XUEJIN_CLOUDBASE_CONFIG = {
  enabled: true,
  env: "你的环境 ID",
  region: "ap-shanghai",
  accessKey: "你的 CloudBase 发布密钥",
  collection: "xuejin_rooms",
  anonymousAuth: true
};
```

5. 在 CloudBase “静态网站托管”部署项目目录。使用 CloudBase CLI 时，可以在项目目录执行：

```bash
npm install -g @cloudbase/cli
tcb login
tcb hosting deploy . -e 你的环境 ID
```

6. 将 CloudBase 静态托管域名加入“安全来源/网站安全域名”，并把实际访问域名加入后再测试实时同步。

注意：当前后台密码仍是网页端入口校验，适合内部工具但不是服务器级权限保护。若后台涉及敏感数据或删除操作，下一步应增加 CloudBase 云函数接口，将后台身份校验和删除权限放到服务端。
