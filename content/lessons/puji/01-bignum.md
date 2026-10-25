# 高精度

> **学完能做到**：用数组表示几百、几千位的大整数，实现加法、减法、乘法、除以小整数。
> **前置知识**：数组、字符串、循环。

---

## 1. 为什么需要高精度

`long long` 最大约 9.2×10¹⁸，也就 19 位。题目让你算 100! 或两个 500 位数相乘时就装不下了。办法是：**用数组一位一位地存，模拟小学的竖式计算**。

## 2. 存储：倒着存

把数字的**个位放在 a[0]**、十位放在 a[1]……这样做竖式时从下标 0 开始往上进位，很自然。

```cpp
// 读入一个大数
string s; cin >> s;
int len = s.size();
vector<int> a(len);
for (int i = 0; i < len; i++) a[i] = s[len - 1 - i] - '0';
// s = "1234"  →  a = [4, 3, 2, 1]
```

输出时从最高位往下：

```cpp
for (int i = len - 1; i >= 0; i--) cout << a[i];
```

## 3. 加法

竖式加法：同一位相加，满 10 进 1。

```
    1 2 3 4
  +   5 6 7
  ---------
    1 8 0 1
```

```cpp
vector<int> add(const vector<int> &a, const vector<int> &b) {
    vector<int> c;
    int carry = 0;
    for (size_t i = 0; i < max(a.size(), b.size()) || carry; i++) {
        int s = carry;
        if (i < a.size()) s += a[i];
        if (i < b.size()) s += b[i];
        c.push_back(s % 10);
        carry = s / 10;
    }
    return c;
}
```

循环条件里有 `|| carry`，保证最高位进位不会丢。

## 4. 减法（a ≥ b）

借位：当前位不够减就向高位借 1，当前位加 10。

```cpp
vector<int> sub(const vector<int> &a, const vector<int> &b) {   // 要求 a >= b
    vector<int> c;
    int borrow = 0;
    for (size_t i = 0; i < a.size(); i++) {
        int s = a[i] - borrow - (i < b.size() ? b[i] : 0);
        if (s < 0) { s += 10; borrow = 1; } else borrow = 0;
        c.push_back(s);
    }
    while (c.size() > 1 && c.back() == 0) c.pop_back();   // 去前导零
    return c;
}
```

如果不知道 a 和 b 谁大，先比较：位数多的大；位数相同从最高位往下比。若 a < b，计算 b - a 并输出负号。

## 5. 乘法

### 高精 × 高精

第 i 位乘第 j 位，结果加到第 **i + j** 位（个位×个位还在个位，十位×个位在十位……）。先全部乘完累加，最后统一进位：

```cpp
vector<int> mul(const vector<int> &a, const vector<int> &b) {
    vector<long long> t(a.size() + b.size(), 0);
    for (size_t i = 0; i < a.size(); i++)
        for (size_t j = 0; j < b.size(); j++)
            t[i + j] += a[i] * b[j];
    vector<int> c(t.size());
    long long carry = 0;
    for (size_t i = 0; i < t.size(); i++) {
        long long s = t[i] + carry;
        c[i] = s % 10;
        carry = s / 10;
    }
    while (c.size() > 1 && c.back() == 0) c.pop_back();
    return c;
}
```

两个长度分别为 n、m 的数相乘，结果最多 n + m 位。复杂度 O(nm)。

### 高精 × 低精（常用）

算阶乘时，乘的是普通整数，可以每一位直接乘：

```cpp
void mulSmall(vector<int> &a, int x) {
    long long carry = 0;
    for (size_t i = 0; i < a.size(); i++) {
        long long s = (long long)a[i] * x + carry;
        a[i] = s % 10;
        carry = s / 10;
    }
    while (carry) { a.push_back(carry % 10); carry /= 10; }
}
```

## 6. 除法：高精 ÷ 低精

除法要从**最高位**往下做（和竖式一样）：

```
  1234 ÷ 7：
  1 ÷ 7 = 0 余 1
  12 ÷ 7 = 1 余 5
  53 ÷ 7 = 7 余 4
  44 ÷ 7 = 6 余 2      商 0176 → 176，余数 2
```

```cpp
// a 是倒着存的，返回商（倒着存），r 是余数
vector<int> divSmall(const vector<int> &a, int b, long long &r) {
    vector<int> c(a.size());
    r = 0;
    for (int i = (int)a.size() - 1; i >= 0; i--) {
        r = r * 10 + a[i];
        c[i] = r / b;
        r %= b;
    }
    while (c.size() > 1 && c.back() == 0) c.pop_back();
    return c;
}
```

## 7. 压位（了解）

每个数组元素存 1 位太浪费。可以每个元素存 4 位（万进制）甚至 9 位，运算次数大大减少。输出时除最高位外，每段要补足前导零（`printf("%04d")`）。普及组一般用不到，数据特别大时再考虑。

## 8. 例题精讲：阶乘之和（P1009）

求 1! + 2! + … + n!（n ≤ 50）。

```cpp
vector<int> fact = {1}, sum = {0};
for (int i = 1; i <= n; i++) {
    mulSmall(fact, i);     // fact = i!
    sum = add(sum, fact);
}
for (int i = sum.size() - 1; i >= 0; i--) cout << sum[i];
```

**技巧**：i! 由 (i-1)! 乘 i 得到，不用每次从头算。

## 9. 例题精讲：数楼梯（P1255）

每次走 1 或 2 级，走 N 级（N ≤ 5000）有几种走法。递推就是斐波那契，但第 5000 项有 1000 多位，必须用高精度加法：

```cpp
vector<int> f0 = {1}, f1 = {1};   // f(0) = 1, f(1) = 1
for (int i = 2; i <= n; i++) {
    vector<int> f2 = add(f0, f1);
    f0 = f1; f1 = f2;
}
// n = 0 时答案按题意处理
```

## 10. 例题精讲：麦森数（P1045）

求 2ᴾ - 1 的位数和最后 500 位（P 可到 3×10⁶）。

1. **位数**：2ᴾ 的位数是 ⌊P × log₁₀2⌋ + 1，2ᴾ - 1 位数相同（2ᴾ 不会是 10 的幂）。
2. **后 500 位**：用快速幂（下一单元会学），每次乘法后只保留低 500 位。高精×高精每次 500×500，快速幂约 22 次乘法，完全够快。

这题综合了高精度、快速幂和数学，是很好的进阶练习。

## 11. 易错点清单

1. **最高位进位**丢失。
2. **前导零**：乘 0、减法后要去掉；但结果是 0 时至少保留一位。
3. **数组开小**：乘法结果是两数位数之和。
4. **输入里的数是正着的**，存的时候要倒过来。
5. 除法要从高位往低位做，和其他运算方向相反。

## 12. 练习指引

**基础题**

- P1601 A+B Problem（高精）：加法模板。
- P1303 A*B Problem：乘法模板，注意乘 0 的情况。

**进阶题**

- P1009 阶乘之和：见例题。
- P1255 数楼梯：见例题。
- P1480 A/B Problem：高精除以低精，见第 6 节。
- P1045 麦森数：见例题。

**建议**：把加、减、乘、除四个函数写成一份自己的模板文件，以后直接复制。

## 13. 自测

1. 为什么要把数字倒过来存？
2. 一个 300 位的数乘一个 200 位的数，结果最多几位？
3. 高精度除法从哪一位开始算？

<details><summary>答案</summary>

1. 让个位在下标 0，进位往高下标走，长度变化只发生在末尾，方便 push_back。
2. 500 位。
3. 最高位。

</details>
