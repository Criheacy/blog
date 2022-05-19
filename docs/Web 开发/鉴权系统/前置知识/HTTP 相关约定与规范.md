---
sidebar_position: 4
title: HTTP 相关约定与规范
---

# HTTP 相关约定 / 规范

:::note

作为具体业务的实现组成，这里的规范并不是强制遵守的。只要客户端发出的请求服务端能理解，服务器发出的响应客户端也能明白，你完全可以使用自己的一套逻辑。我之前也见过不少应用，前端一律发送 POST 请求，后端一律返回 `200 OK` ，靠 response body 中的特殊标记来判断该次请求的状态。不过，如果你的服务要提供第三方接口，以及从后续维护的角度考虑，还是建议统一使用约定好的规范来传输数据，这样浏览器的许多内置功能也能对你的应用做出优化。

:::

## HTTP status code 响应码

这里只挑选部分跟授权相关的进行说明：

### `200 OK`

- 请求成功
- 所有操作都已经按照请求中的执行完成

### `201 Created`

- 创建成功
- 一般是请求中指示应该创建一个资源（例如注册用户），若创建成功则服务器应该使用此返回值

### `400 Bad Request`

- （笼统的）请求错误
- 如果客户端原封不动再次发送请求，则还会收到相同的回复
- 常见用途：
  - 请求中的参数类型、格式错误（例如输入用户数字 ID 的地方输入了字符串）

### `401 Unauthorized`

- 未验明用户身份：指示客户端需要引导用户指明自己的身份
- 需要附带 `WWW-Authenticate` 标头在响应中，告诉客户端服务器支持哪几种身份认证方式；常见的标头格式有：
  - `WWW-Authenticate: Basic realm="My Project"` ：用户应该在 My Project 这个域中使用「用户名+密码」的授权格式，将它们按照 `username:password` 格式排列后使用 base64 编码，附带在下一次请求的 `Authorization` 字段中，整体看上去是这样：`Authorization: Basic base64encode(<username>:<password>)`
  - `WWW-Authenticate: Basic realm="My Project", title="Welcome to My Project!", type="User"` ：与上个例子中相同，只是附带了一些额外信息
  - `WWW-Authenticate: Bearer` ：用户应该在附带自己的 token（令牌）信息作为身份证明，在下一次请求中使用：`Authorization: Bearer <token>`
  - `WWW-Authenticate: Basic realm="My Project", Bearer, NewAuth realm="Auth Center"`：同时支持 `Basic`、`Bearer`、`NewAuth` 三种认证方式（`NewAuth` 并非标准格式，可能是客户端和服务器事先约定好的）
- 虽然写着叫 unauthorized，但从语义上相当于 unauthenticated（未验明身份）
- 一般来说，提供适当的授权总有方式访问资源。如果**无论何种身份**都不允许访问资源，则应该返回 `403 Forbidden` 或 `404 Not Found`

### `403 Forbidden`

- 服务器能完全理解客户端的请求，但因为一些原因拒绝执行它；可能因为：
  - 用户越权行为，例如普通用户尝试使用管理员特有的「封禁用户」操作
  - 用户想要执行一种服务器不支持的操作
  - 用户的账号已经被封禁，不允许再执行请求的操作
- 其实这才是 unauthorized，`401 Unauthorized` 严格来说属于 anthenticated
- 如果用户当前处于未登录状态（请求中不包含身份信息），那么提供了身份信息也将无济于事（仍然会返回 `403 Forbidden`）。如果并不符合这一条，则应该返回 `401 Unauthorized`。

### `404 Not Found`

- 服务器找不到客户端请求的资源
- 有时服务器需要隐藏资源的存在性，也会使用这条返回值，意为「虽然我这有你请求的资源，但我不愿意提供给你，也不愿意告诉你我**拥有**它」
  - 正因如此，有时用户权限不足需要返回 `404 Not Found` 而不是 `403 Forbidden`。
  - 例如，某网站设定用户之间互相不可见，但如果用户访问一个**确实**不存在的用户 `/user/notExist` 时返回 `404 Not Found`，而访问一个存在的用户 `/user/jack` 时返回 `403 Forbidden`，则他就知道了有 Jack 这个用户存在，这就违背了「用户不可见」这个设定。