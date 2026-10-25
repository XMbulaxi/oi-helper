# 数学基础：GCD、素数、快速幂

> **学完能做到**：求最大公约数和最小公倍数；用筛法求出范围内所有素数；分解质因数；快速计算 aᵇ mod p。
> **前置知识**：循环、函数。

---

## 1. 最大公约数（GCD）

### 辗转相除法（欧几里得算法）

**gcd(a, b) = gcd(b, a mod b)**，gcd(a, 0) = a。

手推 gcd(48, 18)：

```
gcd(48, 18) = gcd(18, 48 % 18 = 12)
            = gcd(12, 18 % 12 = 6)
            = gcd(6, 12 % 6 = 0)
            = 6
```

**为什么对**：设 d 是 a 和 b 的公约数，a = qb + r，那么 r = a - qb 也能被 d 整除。所以 (a, b) 和 (b, r) 的公约数完全相同。

```cpp
long long gcd(long long a, long long b) {
    return b == 0 ? a : gcd(b, a % b);
}
```

复杂度 O(log min(a, b))，非常快。C++17 可以直接用 `std::gcd(a, b)`，或者 GCC 的 `__gcd(a, b)`。

### 最小公倍数（LCM）

**lcm(a, b) = a / gcd(a, b) × b**

先除后乘，防止 a × b 溢出。

### 例：三角函数（P1888）

给直角三角形三边，求较小锐角的正弦值，用最简分数表示。sin = 最短边 / 最长边，用 gcd 约分。

## 2. 判断素数

试除到 √n（零基础阶段学过）：

```cpp
bool isPrime(long long n) {
    if (n < 2) return false;
    for (long long i = 2; i * i <= n; i++)
        if (n % i == 0) return false;
    return true;
}
```

单次 O(√n)。如果要判断 1～n 里**每个数**，用筛法更快。

## 3. 素数筛

### 埃拉托斯特尼筛（埃氏筛）

思路：从 2 开始，每找到一个素数，就把它的所有倍数划掉。

```
2 3 4 5 6 7 8 9 10 11 12
2 是素数 → 划掉 4 6 8 10 12
3 是素数 → 划掉 9（6、12 已经划过）
5 是素数 → 25 > 12，停
剩下：2 3 5 7 11
```

```cpp
bool notPrime[N];
void sieve(int n) {
    notPrime[0] = notPrime[1] = true;
    for (int i = 2; (long long)i * i <= n; i++)
        if (!notPrime[i])
            for (int j = i * i; j <= n; j += i)   // 从 i*i 开始，更小的倍数已被更小的素数划掉
                notPrime[j] = true;
}
```

复杂度 O(n log log n)，接近线性。

### 线性筛（欧拉筛）

埃氏筛中 12 会被 2 和 3 各划一次。线性筛保证**每个合数只被它的最小质因子划掉一次**，严格 O(n)。

```cpp
int primes[N], cnt;
bool notPrime[N];
void linearSieve(int n) {
    for (int i = 2; i <= n; i++) {
        if (!notPrime[i]) primes[cnt++] = i;
        for (int j = 0; j < cnt && (long long)i * primes[j] <= n; j++) {
            notPrime[i * primes[j]] = true;
            if (i % primes[j] == 0) break;   // 关键：primes[j] 是 i 的最小质因子，再往后就不是最小的了
        }
    }
}
```

**为什么要 break**：如果 i 能被 p = primes[j] 整除，那么 i × primes[j+1] 的最小质因子是 p 而不是 primes[j+1]，它应该留给以后的 i' = i × primes[j+1] / p 来划。

## 4. 分解质因数

每个大于 1 的整数都能唯一地写成质数的乘积：360 = 2³ × 3² × 5。

```cpp
vector<pair<long long, int>> factorize(long long n) {
    vector<pair<long long, int>> res;
    for (long long p = 2; p * p <= n; p++) {
        if (n % p) continue;
        int e = 0;
        while (n % p == 0) { n /= p; e++; }
        res.push_back({p, e});
    }
    if (n > 1) res.push_back({n, 1});   // 剩下的一定是一个大于 √n 的质数
    return res;
}
```

**为什么 p 一定是质数**：比 p 小的质因子已经被除干净了，所以能整除 n 的 p 不可能是合数。

### 例：质因数分解（P1075）

n 是两个不同质数的乘积，输出较大的那个。从 2 开始找到第一个因数 p，答案就是 n / p。

## 5. 快速幂

计算 aᵇ mod p，b 可能到 10¹⁸。直接乘 b 次肯定超时。

### 思路：二进制拆分

3¹³：13 = 1101₂ = 8 + 4 + 1，所以 3¹³ = 3⁸ × 3⁴ × 3¹。

而 3¹, 3², 3⁴, 3⁸ 可以通过**反复平方**得到。只需要 log₂b 次。

```cpp
long long power(long long a, long long b, long long p) {
    long long res = 1 % p;
    a %= p;
    while (b > 0) {
        if (b & 1) res = res * a % p;   // 当前二进制位是 1，乘上
        a = a * a % p;                  // a 变成 a², a⁴, a⁸, ...
        b >>= 1;                        // 看下一位
    }
    return res;
}
```

手推 3¹³ mod 1000：

| b（二进制） | 末位 | res | a |
| --- | --- | --- | --- |
| 1101 | 1 | 3 | 9 |
| 110 | 0 | 3 | 81 |
| 11 | 1 | 243 | 6561 % 1000 = 561 |
| 1 | 1 | 243 × 561 % 1000 = 323 | ... |

3¹³ = 1594323，mod 1000 = 323 ✓

### 取模的规则

- (a + b) mod p = ((a mod p) + (b mod p)) mod p
- (a × b) mod p = ((a mod p) × (b mod p)) mod p
- (a - b) mod p = ((a mod p) - (b mod p) + p) mod p ← 加 p 防止负数
- **除法不能直接取模**，需要逆元（提高组会学）。

**两个 10⁹ 级的数相乘会超过 long long 吗？** 10⁹ × 10⁹ = 10¹⁸ < 9.2×10¹⁸，不会。但 p 超过约 3×10⁹ 时就要小心了。

## 6. 例题精讲：最大公约数和最小公倍数问题（P1029）

给 x₀ 和 y₀，问有多少对正整数 (P, Q) 满足 gcd = x₀ 且 lcm = y₀。

**性质**：P × Q = gcd × lcm = x₀ × y₀。

所以枚举 P（P 是 x₀ 的倍数，且 P 整除 x₀ × y₀），算出 Q = x₀ × y₀ / P，检查 gcd(P, Q) == x₀。

## 7. 例题精讲：素数密度（P1835）

求 [L, R] 中素数个数，L、R 到 2³¹，但 R - L ≤ 10⁶。

**区间筛**：[L, R] 中的合数一定有一个 ≤ √R（约 46341）的质因子。先筛出 √R 以内的质数，再用它们去划 [L, R] 里的倍数。

```cpp
// 对每个小质数 p，划掉 [L, R] 中 p 的倍数（但不划 p 本身）
for (int p : smallPrimes) {
    long long start = max((long long)p * p, (L + p - 1) / p * p);
    for (long long j = start; j <= R; j += p) bad[j - L] = true;
}
// 注意 L = 1 时，1 不是素数
```

## 8. 易错点清单

1. lcm 先乘后除导致溢出。
2. 取模运算中途忘了取模，乘法溢出。
3. 减法取模出现负数，记得 `+ p` 再 `% p`。
4. 快速幂中 p = 1 时答案应为 0（`res = 1 % p` 就是处理这个）。
5. 1 不是素数，0 也不是。
6. 线性筛忘了 break，退化成 O(n log n) 甚至出错。

## 9. 练习指引

**基础题**

- P1888 三角函数：gcd 约分。
- P1075 质因数分解：见上文。
- P1029 最大公约数和最小公倍数问题：见例题。
- P3383 线性筛素数：线性筛模板，询问第 k 小的素数。数据大，用快速输入输出。
- P1226 快速幂：模板，按题目要求的格式输出。

**进阶题**

- P1835 素数密度：见例题。
- P1072 Hankson 的趣味题：已知 gcd(x, a0) = a1，lcm(x, b0) = b1，求 x 的个数。x 一定是 b1 的约数，枚举 b1 的所有约数（O(√b1)）逐一检查。

## 10. 自测

1. gcd(84, 36) 是多少？
2. 为什么埃氏筛的内层循环可以从 i × i 开始？
3. 用快速幂算 2¹⁰⁰ mod 7，需要循环几次？

<details><summary>答案</summary>

1. 12。
2. 比 i × i 小的 i 的倍数 i × k（k < i）已经被 k 的某个质因子划掉了。
3. 100 的二进制有 7 位，循环 7 次。

</details>
