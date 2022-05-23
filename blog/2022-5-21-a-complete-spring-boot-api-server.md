---
slug: a-complete-spring-boot-api-server
title: 搭建「完备」的 API 服务端
authors:
  name: Criheacy
  title: Owner of this Blog
  url: https://github.com/Criheacy
  image_url: https://github.com/Criheacy.png
tags: [spring-boot, java, server, perfection]
---

## 什么叫「完备」？

这个问题是在写 Open Project 的时候遇到的。Open Project 的接口的返回 JSON 都遵循统一的格式：

```text
GET /user/Criheacy
```

```json
HTTP 200 OK
{
    "code": "SUCCESS",
    "data": {
        "id": 123,
        "name": "Criheacy",
        "role": "admin"
    }
}
```

然而如果服务端在处理时碰到了一些问题，它就有可能不按照这个约定格式来发送响应。所谓的「一些问题」并不是因为服务端代码有 bug 导致处理过程出现了问题，而是客户端没有按照约定发送数据，此时服务端没有按照上述格式来告知客户端这个错误信息，甚至还暴露了一些内部实现。

举例来说，正常情况下可以通过 `GET /user/{userId}` 返回指定 ID 的用户信息。但是当用户发送这个请求：

```text
GET /user/123123123NotAValidUserId123123
```

显然后面的字符串无法被 spring boot 自动转换成数字，因此它会自动返回一个 `400 Bad Request` 作为响应，但响应体中没有包含任何信息。这个返回码确实没什么问题，但是不提供任何返回值信息一来不符合上面的约定格式（可能会让一些客户端代码读到空字段而出错），二来可能让 API 调用者不清楚状况。

具体来说，还有以下几种类似的情况：

- 请求体中的参数不合法（必要的参数缺失、参数无法转换成目标类型、枚举类型的参数给定了不在枚举选项之外的值）都会返回 `400 Bad Request` 和空响应体

- 请求的方法错误，spring boot 返回 `405 Method Not Allowed` 并能够自动添加 `Allow` 标头，不过响应体为空

- 请求的 url 没有对应的 Controller 来处理，此时会返回 `404 Not Found` 并返回以下格式的错误信息：

  ```JSON
  {
      "timestamp": "2022-05-22T08:00:00.000+00:00",
      "status": 404,
      "error": "Not Found",
      "message": "No message available",
      "path": "/not-exist"
  }
  ```

- 请求的过程中服务器出现内部错误，此时会返回 `500 Internal Server Error` 并返回以下格式的错误信息：

  ```JSON
  {
    "timestamp": "2022-05-22T08:00:00.000+00:00",
    "status": 500,
    "error": "Internal Server Error",
    "message": "com.openproject.user.UserDO is null",
    "trace": "java.lang.NullPointerException: com.openproject.user.UserDO is null", 
    "path": "/user/123"
  } 
  ```

其中最后一个不属于「客户端错误」的范畴，但也是类似的问题，我希望它即使在代码运行过程中出错也能以标准格式返回，而不是把一些服务器内部实现细节暴露给用户（这可能导致黑客有针对性地构造攻击）。

:::note

你可能会觉得这都是鸡毛蒜皮的小问题，只是为难一下强迫症患者。我承认在一些简单的小工程或者比较简陋的外包项目中确实没必要花时间解决这些细节，有这时间还不如早点把项目结了多接个单。我这里只是分享一下解决这个问题的方法，用不用在具体的工程中全凭个人自愿，「不想花时间解决」和「不知道怎么解决」那是两个概念。

:::

## 如何解决？

### Runtime Exception

网上有很多这之类的解决方案，搜索 global exception handler 就能搜到一大堆类似的处理方法。Spring boot 提供了一种错误的处理方式，针对没有被 catch 的 exception 在返回时可以统一使用这个方法来处理。

```java
@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

  @ExceptionHandler(Exception.class)
  public ResponseEntity<String> handleExceptionDefault(Exception exception) {
    // print exception information
    logger.error(exception);
    exception.printStackTrace();
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(new ResponseModel(ApiResponseCode.SERVER_ERROR).toJson());
  }
}
```

这个方法可以看作一个 Controller，返回值和具体的返回逻辑都可以自行指定，这里的 `ResponseModel` 及其上的 `toJson` 方法是自定义的用于返回上面说的「标准格式」的类。

从原理来说，`@ControllerAdvice` 注解让它成为 Spring bean 并能够被注入到 spring 内部框架的处理逻辑中；在方法上的 `@ExceptionHandler` 则指定了这个类能处理什么类型的异常。

经过测试，当代码中出现运行时错误时（比如还是上面的 `NullPointerException`）Spring 就不再会把 stack trace 直接打印给客户端了，而是按照指定的格式返回：

```json
HTTP 500 Internal Server Error
{
	"code": "SERVER_ERROR",
	"timestamp": 1234567890
}
```

### Request Exception

按理说上面代码中 `@ExceptionHandler(Exception.class)` 指定的 `Exception` 是所有异常类的基类，应该能够处理所有类型的异常；但它仍有一些异常处理不了，准确地说除了用户处理逻辑代码中出现的运行时异常以外都不会被处理，仍然按照上面的提到的该返回空返回空，该返回 Not Found 返回 Not Found。例如上面说的请求方法错误时，仍然返回 `405 Method Not Allowed` 和空响应体，并且在 Spring log 中会打印这样一条日志：

```text
... .m.m.a.ExceptionHandlerExceptionResolver : Resolved [org.springframework.web.HttpRequestMethodNotSupportedException: Request method 'PATCH' not supported]
```

我查看了 `HttpRequestMethodNotSupportedException` 这个异常类，发现它确实是继承于 `Exception` 类的；于是我尝试另外写一个 handler 方法并打上 `@ExceptionHandler(HttpRequestMethodNotSupportedException.class)` 这个（超长的）注解：

```java
@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
  
  // other handlers
  // ...
    
  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  public ResponseEntity<String> handleMethodNotAllowed(HttpRequestMethodNotSupportedException exception) {
    logger.error(exception);
    exception.printStackTrace();
    return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
      .body(new ResponseModel(ApiResponseCode.SERVER_ERROR).toJson());
  }
}
```

结果这次服务端程序直接启动失败，日志是这样的：

```text
Ambiguous @ExceptionHandler method mapped for [class org.springframework.web.HttpRequestMethodNotSupportedException]: {public org.springframework.http.ResponseEntity com.openproject.common.config.GlobalExceptionHandler.handleMethodNotAllowed(org.springframework.web.HttpRequestMethodNotSupportedException), public final org.springframework.http.ResponseEntity org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler.handleException(java.lang.Exception,org.springframework.web.context.request.WebRequest) throws java.lang.Exception}
```

翻译一下就是拥有 `@ExceptionHandler` 这个注解的有两个以上的方法，也就是两个方法都能处理 Method Not Allowed 这个异常，Spring 就不知道碰到这个问题的时候应该交给谁去处理了。其中一个方法就是刚刚写的`GlobalExceptionHandler.handleMethodNotAllowed ` ；另一个则是 `ResponseEntityExceptionHandler.handleException` ，这看起来像是一个 Spring 内置的方法。果然，`ResponseEntityExceptionHandler` 正是前面 `GlobalExceptionHandler` 继承自的默认抽象类。点开它 decompile 之后的字节码文件，发现其中已经内置了大量的 handler，用于处理各种各样的异常：

```java
@ExceptionHandler({HttpRequestMethodNotSupportedException.class, HttpMediaTypeNotSupportedException.class, HttpMediaTypeNotAcceptableException.class, MissingPathVariableException.class, MissingServletRequestParameterException.class, ServletRequestBindingException.class, ConversionNotSupportedException.class, TypeMismatchException.class, HttpMessageNotReadableException.class, HttpMessageNotWritableException.class, MethodArgumentNotValidException.class, MissingServletRequestPartException.class, BindException.class, NoHandlerFoundException.class, AsyncRequestTimeoutException.class})
@Nullable
public final ResponseEntity<Object> handleException(Exception ex, WebRequest request) throws Exception {
  HttpHeaders headers = new HttpHeaders();
  HttpStatus status;
  if (ex instanceof HttpRequestMethodNotSupportedException) {
    status = HttpStatus.METHOD_NOT_ALLOWED;
    return this.handleHttpRequestMethodNotSupported((HttpRequestMethodNotSupportedException)ex, headers, status, request);
  } else if (ex instanceof HttpMediaTypeNotSupportedException) {
    status = HttpStatus.UNSUPPORTED_MEDIA_TYPE;
    return this.handleHttpMediaTypeNotSupported((HttpMediaTypeNotSupportedException)ex, headers, status, request);
  } else if (ex instanceof HttpMediaTypeNotAcceptableException) {
    status = HttpStatus.NOT_ACCEPTABLE;
    return this.handleHttpMediaTypeNotAcceptable((HttpMediaTypeNotAcceptableException)ex, headers, status, request);
  } else if (ex instanceof MissingPathVariableException) {
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    return this.handleMissingPathVariable((MissingPathVariableException)ex, headers, status, request);
  } else if (ex instanceof MissingServletRequestParameterException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleMissingServletRequestParameter((MissingServletRequestParameterException)ex, headers, status, request);
  } else if (ex instanceof ServletRequestBindingException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleServletRequestBindingException((ServletRequestBindingException)ex, headers, status, request);
  } else if (ex instanceof ConversionNotSupportedException) {
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    return this.handleConversionNotSupported((ConversionNotSupportedException)ex, headers, status, request);
  } else if (ex instanceof TypeMismatchException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleTypeMismatch((TypeMismatchException)ex, headers, status, request);
  } else if (ex instanceof HttpMessageNotReadableException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleHttpMessageNotReadable((HttpMessageNotReadableException)ex, headers, status, request);
  } else if (ex instanceof HttpMessageNotWritableException) {
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    return this.handleHttpMessageNotWritable((HttpMessageNotWritableException)ex, headers, status, request);
  } else if (ex instanceof MethodArgumentNotValidException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleMethodArgumentNotValid((MethodArgumentNotValidException)ex, headers, status, request);
  } else if (ex instanceof MissingServletRequestPartException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleMissingServletRequestPart((MissingServletRequestPartException)ex, headers, status, request);
  } else if (ex instanceof BindException) {
    status = HttpStatus.BAD_REQUEST;
    return this.handleBindException((BindException)ex, headers, status, request);
  } else if (ex instanceof NoHandlerFoundException) {
    status = HttpStatus.NOT_FOUND;
    return this.handleNoHandlerFoundException((NoHandlerFoundException)ex, headers, status, request);
  } else if (ex instanceof AsyncRequestTimeoutException) {
    status = HttpStatus.SERVICE_UNAVAILABLE;
    return this.handleAsyncRequestTimeoutException((AsyncRequestTimeoutException)ex, headers, status, request);
  } else {
    throw ex;
  }
}
```

这个类内部逻辑像是一个 router，并且标注了 final 表明这些异常都必须交由 Spring 处理。而每种异常具体的处理逻辑则是由它导向的单独的函数负责，而这些单独的函数是可以被 override 重写的。还是以 Method Not Allowed 为例，这段代码第一个逻辑分支（line 6~8）就指定了应该交由 `this.handleHttpRequestMethodNotSupported` 处理：

```java
protected ResponseEntity<Object> handleHttpRequestMethodNotSupported(HttpRequestMethodNotSupportedException ex, HttpHeaders headers, HttpStatus status, WebRequest request) {
  pageNotFoundLogger.warn(ex.getMessage());
  Set<HttpMethod> supportedMethods = ex.getSupportedHttpMethods();
  if (!CollectionUtils.isEmpty(supportedMethods)) {
    headers.setAllow(supportedMethods);
  }

  return this.handleExceptionInternal(ex, (Object)null, headers, status, request);
}
```

可以看到设置 `Allow` 标头字段的逻辑就在其中。而对于其它一些方法，这部分就是简单的构造了一个空的响应体作为返回，这也解释了上面种种 `Bad Request` 的情况：

```java
protected ResponseEntity<Object> handleMissingPathVariable(MissingPathVariableException ex, HttpHeaders headers, HttpStatus status, WebRequest request) {
  return this.handleExceptionInternal(ex, (Object)null, headers, status, request);
}
```

它们共同调用的 `handlerExceptionInternal` 就是负责把 headers 和 body 打包成 `ResponseEntity` 返回：

```java
protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body, HttpHeaders headers, HttpStatus status, WebRequest request) {
  if (HttpStatus.INTERNAL_SERVER_ERROR.equals(status)) {
    request.setAttribute("javax.servlet.error.exception", ex, 0);
  }

  return new ResponseEntity(body, headers, status);
}
```

而这些 protected 的方法都是可以重载的，只需要在继承于`ResponseEntityExceptionHandler` 的 `GlobalExceptionHandler` 中 `@Override` 这些方法就好。如果想添加某种方法的处理逻辑可以单独重写某种异常的 handler；而如果想规定一下统一格式则只需要重写那个 internal 方法就好。写好之后测试一下，碰到 Method Not Allowed 之类的错误时就可以按照要求返回了。

### Not Found / Unsupported API

现在还剩一种错误没有按照规定格式返回：当请求的 url 没有对应的 Controller 来处理时，服务器会返回 `404 Not Found` 和以下格式的响应体：

  ```JSON
  {
      "timestamp": "2022-05-24T08:00:00.000+00:00",
      "status": 404,
      "error": "Not Found",
      "message": "No message available",
      "path": "/not-exist"
  }
  ```

如果 `Accept` 字段被设置为 `text/html` 时，可以从浏览器上看到以下页面：

> <html><body><h1>Whitelabel Error Page</h1><p>This application has no explicit mapping for /error, so you are seeing this as a fallback.</p><div id='created'>Tue May 24 CST 2022</div><div>There was an unexpected error (type=Not Found, status=404).</div><div>No message available</div></body></html>

其实这里已经提示了，针对这种错误要在 /error 这个路径下设置一个 Controller 作为 fallback ，我们只需要按照要求实现一个 Controller 并且用 `@RequestMapping` handle 这个路径即可：

```java
@RestController
public class ApplicationErrorController implements ErrorController {

  private static final String ERROR_PATH = "/error";

  @RequestMapping(ERROR_PATH)
  public ApiResponseCode fallbackHandler() {
    return ApiResponseCode.UNSUPPORTED_API;
  }
}
```

 这样就可以收到自定义的信息了：

```json
{
    "code": "UNSUPPORTED_API"
}
```

这里我一开始尝试过 `@RequestMapping({*})` 这种写法，这代表匹配任意路径；但这样会使前面设置的 Method Not Allowed 失效（因为这里有合适的 handler，Spring 不再认为请求方法不合法）。`/error` 就是 Spring 官方指定的错误页面映射路径，在设计 API 时避免使用这个路径就可以了。

## 另外的小技巧

前面介绍的 `GlobalExceptionHandler` 其实还有别的用法。在 Open Project 中设置了一种自定义的错误类型，叫 `ApiException` （继承于 `Exception` 基类）：

```java
public class ApiException extends Exception {

  private ApiResponseCode apiResponseCode;

  public ApiException(ApiResponseCode apiResponseCode) {
    super(apiResponseCode.getCode());
    this.apiResponseCode = apiResponseCode;
  }
}

```

这个 `Exception` 中包含了一个 ApiResponseCode，而在 `GlobalExceptionHandler` 的 `ExceptionHandler` 可以通过 `getApiResponseCode` 将其获取出来，并直接作为返回值。这其实不是一个代码中的「异常」，而是方便编写逻辑时快速返回的「逻辑语法糖」，在业务代码中可以随时使用 `throw new ApiException` 附上此时的返回码来快速在逻辑语句中创建一个响应分支，算是一种提升开发速度的方法。
