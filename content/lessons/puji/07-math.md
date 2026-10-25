# 数学基础：GCD、素数、快速幂

## 最大公约数与最小公倍数

辗转相除法：

```cpp
long long gcd(long long a, long long b) { return b == 0 ? a : gcd(b, a % b); }
long long lcm(long long a, long long b) { return a / gcd(a, b) * b; }  // 先除后乘防溢出
```

C++17 也可以直接用 `__gcd(a, b)` 或 `std::gcd`。

## 素数筛

判断 1～n 里哪些是素数。

**埃氏筛**（好理解）：

```cpp
for (int i = 2; i <= n; i++)
    if (!notPrime[i])
        for (long long j = (long long)i * i; j <= n; j += i) notPrime[j] = true;
```

**线性筛**（P3383 模板，更快）：

```cpp
for (int i = 2; i <= n; i++) {
    if (!notPrime[i]) primes[cnt++] = i;
    for (int j = 0; j < cnt && i * primes[j] <= n; j++) {
        notPrime[i * primes[j]] = true;
        if (i % primes[j] == 0) break;   // 保证每个合数只被它最小的质因子筛掉
    }
}
```

## 分解质因数

从 2 开始试除，到 √n 为止，最后剩下的大于 1 的数也是一个质因子。

## 快速幂

计算 a^b mod p，把 b 拆成二进制：

```cpp
long long power(long long a, long long b, long long p) {
    long long res = 1 % p;
    a %= p;
    while (b > 0) {
        if (b & 1) res = res * a % p;
        a = a * a % p;
        b >>= 1;
    }
    return res;
}
```

复杂度 O(log b)，b 到 10¹⁸ 也很快。

## 常见错误

1. 取模的题中途没取模，乘法溢出。
2. `lcm` 先乘后除导致溢出。
3. 快速幂里 `p = 1` 时答案应为 0（上面 `1 % p` 就是处理这个）。

## 做题建议

P1888 用 gcd 约分。P1075 质因数分解只需要找到最小的质因子。P1029 枚举一个数，另一个数就确定了。
