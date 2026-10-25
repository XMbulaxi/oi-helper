# 字符串

## 两种写法

**string（推荐）**

```cpp
string s;
cin >> s;              // 读一个单词（遇到空格停止）
getline(cin, s);       // 读一整行（包括空格）
cout << s.size();      // 长度
s[0];                  // 第一个字符
s += "abc";            // 拼接
s.substr(2, 3);        // 从下标 2 开始取 3 个字符
s.find("ab");          // 查找，找不到返回 string::npos
```

**char 数组**

```cpp
char s[105];
scanf("%s", s);
int len = strlen(s);
```

## 字符的运算

字符本质上是数字（ASCII 码），可以直接加减：

- `'a' + 1` 是 `'b'`
- 小写转大写：`c - 'a' + 'A'`，或者用 `toupper(c)`
- 数字字符转数字：`c - '0'`
- 判断：`isdigit(c)`、`isalpha(c)`、`isupper(c)`

## 凯撒密码的循环移位

```cpp
c = (c - 'a' + k) % 26 + 'a';
```

## 常见错误

1. `cin >> s` 后接 `getline`，会读到上一行剩下的换行。中间加一个 `getline` 或 `cin.ignore()`。
2. 统计单词时大小写没有统一。
3. 用 `s.size() - 1` 做循环边界，当 `s` 为空时会出错（`size()` 是无符号数）。

## 做题建议

P5733、P1914 练字符运算。P5015 练读整行。P1308 统计单词数是本单元的综合题：注意要匹配**完整单词**且不区分大小写。
