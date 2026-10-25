# 字符串

> **学完能做到**：读入和处理单词、整行文本；字符和数字互相转换；完成统计、替换、查找类题目。
> **前置知识**：数组、循环。

---

## 1. 字符和 ASCII 码

每个字符在计算机里都是一个数字（ASCII 码）：

| 字符 | ASCII | 规律 |
| --- | --- | --- |
| `'0'`～`'9'` | 48～57 | 连续 |
| `'A'`～`'Z'` | 65～90 | 连续 |
| `'a'`～`'z'` | 97～122 | 连续 |
| 空格 | 32 | |

因为是连续的，所以可以直接做加减：

```cpp
char c = 'a';
c + 1          // 'b'
'7' - '0'      // 7    字符变数字
3 + '0'        // '3'  数字变字符
c - 'a'        // 0    这是第几个字母（从 0 开始）
c - 'a' + 'A'  // 'A'  小写变大写（也可以 c - 32）
```

常用函数：`isdigit(c)` 是否数字、`isalpha(c)` 是否字母、`isupper(c)` / `islower(c)`、`toupper(c)` / `tolower(c)`。

## 2. string（推荐使用）

```cpp
string s = "hello";
s.size()           // 长度 5（也可写 s.length()）
s[0]               // 'h'  下标从 0 开始
s += " world";     // 拼接：hello world
s + "!"            // 返回拼接后的新字符串
s == "abc"         // 直接比较是否相等
s < t              // 按字典序比较
s.substr(2, 3)     // 从下标 2 开始取 3 个字符："llo"
s.find("lo")       // 查找子串第一次出现的位置，找不到返回 string::npos
s.insert(2, "XY")  // 在下标 2 处插入
s.erase(1, 2)      // 从下标 1 开始删 2 个字符
reverse(s.begin(), s.end());  // 反转
to_string(123)     // 数字转字符串 "123"
stoi("123")        // 字符串转 int；stoll 转 long long
```

### 读入

```cpp
string s;
cin >> s;          // 读一个"单词"：遇到空格、换行就停
getline(cin, s);   // 读一整行，包括空格
```

> ⚠️ `cin >> n;` 之后紧接着 `getline(cin, s);`，会读到**上一行末尾剩下的换行**，得到空字符串。解决：中间加一句 `cin.ignore();` 或多调用一次 `getline`。

### 遍历

```cpp
for (int i = 0; i < (int)s.size(); i++) {
    char c = s[i];
    ...
}
// 或者
for (char c : s) { ... }
// 想修改字符要用引用
for (char &c : s) c = toupper(c);
```

> `s.size()` 是**无符号数**。`s.size() - 1` 在 s 为空时会变成一个巨大的数。写成 `(int)s.size() - 1` 更安全。

## 3. char 数组（了解）

老代码和 `scanf` 常用：

```cpp
char s[105];
scanf("%s", s);          // 读一个单词
int len = strlen(s);     // 长度（每次调用都要从头数一遍，别放在循环条件里）
strcmp(a, b)             // 比较，相等返回 0
strcpy(a, b)             // 复制 b 到 a
```

能用 `string` 就用 `string`，更不容易出错。

## 4. 常见题型

### ① 逐字符变换：凯撒密码（P1914）

每个小写字母往后移 n 位，`z` 之后回到 `a`：

```cpp
for (char &c : s) c = (c - 'a' + n) % 26 + 'a';
```

拆开看：`c - 'a'` 变成 0～25 的编号 → 加 n → 模 26 绕回来 → 加 `'a'` 变回字母。

### ② 统计：标题统计（P5015）

读一整行，数里面有多少个不是空格也不是换行的字符：

```cpp
string s;
getline(cin, s);
int cnt = 0;
for (char c : s) if (c != ' ' && c != '\n' && c != '\r') cnt++;
```

> Windows 下的输入文件行尾可能有 `'\r'`，统计时要排除。

### ③ 字母计数：笨小猴（P1125）

```cpp
int cnt[26] = {0};
for (char c : s) cnt[c - 'a']++;
```

又是"桶"，下标用 `c - 'a'`。

### ④ 查找单词：统计单词数（P1308）

在文章里找一个单词出现的次数和第一次的位置，**完整匹配**且**不区分大小写**。

技巧：

1. 把单词和文章都转成小写。
2. 在单词和文章的**前后各加一个空格**，然后查找 `" " + word + " "`。这样 `"to"` 就不会匹配到 `"tomorrow"` 里。

```cpp
string w, t;
getline(cin, w); getline(cin, t);
for (char &c : w) c = tolower(c);
for (char &c : t) c = tolower(c);
w = " " + w + " ";
t = " " + t + " ";
int first = t.find(w);
if (first == (int)string::npos) { cout << -1; return 0; }
int cnt = 0;
for (size_t p = t.find(w); p != string::npos; p = t.find(w, p + 1)) cnt++;
cout << cnt << " " << first;   // 因为前面加了空格，位置刚好对上
```

## 5. 字符串和数字互转

```cpp
// 数字 → 字符串
string s = to_string(2026);
// 字符串 → 数字
int x = stoi("2026");
// 手写：字符串 → 数字（以后高精度、快读都用这个思路）
int v = 0;
for (char c : s) v = v * 10 + (c - '0');
```

## 6. 易错点清单

1. `cin` 后接 `getline` 读到空行。
2. `s.size() - 1` 无符号溢出。
3. 统计单词时大小写没统一、没有完整匹配。
4. 行尾的 `'\r'`。
5. `strlen` 放进循环条件，导致 O(n²) 超时。

## 7. 练习指引

**基础题**

- P5733 自动修正：全部转成大写。
- P1914 凯撒密码：见上文。
- P5015 标题统计：见上文。
- P1765 手机：手机键盘每个字母要按几下，可以把 26 个字母的按键次数写成一个数组。

**进阶题**

- P1125 笨小猴：字母桶 + 判断质数。
- P1957 口算练习题：每行第一个可能是运算符字母，也可能是数字（表示和上一题运算符相同）。输出算式和它的长度，可以用 `to_string` 拼起来再求长度。
- P5734 文字处理软件：直接用 `string` 的 `+=`、`substr`、`insert`、`find`。
- P3741 honoka的键盘：先数 `VK` 个数，再看能否改一个字符多出一个 `VK`（`VV` 或 `KK`）。
- P1308 统计单词数：见上文。

## 8. 自测

1. `'5' - '0' + 1` 等于多少？类型是什么？
2. `s = "abcdef"`，`s.substr(1, 3)` 是什么？
3. 怎样判断一个字符是不是小写字母？

<details><summary>答案</summary>

1. 6，类型是 int。
2. `"bcd"`。
3. `c >= 'a' && c <= 'z'`，或者 `islower(c)`。

</details>
