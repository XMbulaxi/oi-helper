# 数位 DP

> **学完能做到**：统计 [L, R] 中满足某种数位条件的数的个数（或数位之和）；写出记忆化搜索形式的数位 DP 模板；处理前导零和上界限制。
> **前置知识**：记忆化搜索。

---

## 1. 问题特征

"在 [L, R] 中，有多少个数满足：……（和每一位数字有关的条件）"，R 可能到 10¹⁸。

暴力枚举每个数肯定不行。数位 DP **按位填数**，用 DP 合并"后面的位可以随便填"的大量情况。

## 2. 两个基本技巧

### 差分

答案 = **count(R) - count(L - 1)**，其中 count(x) 表示 [0, x] 中满足条件的个数。只需要会算 [0, x]。

### 上界限制

从最高位往低位填。如果前面填的每一位都和 x 相同，那么当前位最多只能填到 x 的这一位（**贴着上界**）；只要前面有一位比 x 小，后面就可以随便填 0～9。

```
x = 2 3 5
填第 1 位：可以填 0, 1, 2
  填 0 或 1：后面两位随便填（00～99）
  填 2：第 2 位最多填 3
    填 0～2：最后一位随便填
    填 3：最后一位最多填 5
```

## 3. 模板（记忆化搜索）

```cpp
int digit[20];            // x 的每一位，digit[1] 是最低位
long long mem[20][...];   // 记忆化数组，第二维是题目需要的状态

// pos：当前处理第几位（从高到低）
// state：题目需要记录的信息（比如上一位数字、数位和……）
// limit：前面是否都贴着上界
// lead：前面是否都是前导零
long long dfs(int pos, int state, bool limit, bool lead) {
    if (pos == 0) return 检查 state 是否满足条件 ? 1 : 0;
    if (!limit && !lead && mem[pos][state] != -1) return mem[pos][state];
    int up = limit ? digit[pos] : 9;
    long long res = 0;
    for (int d = 0; d <= up; d++) {
        if (不允许填 d) continue;
        res += dfs(pos - 1, 新的 state, limit && d == up, lead && d == 0);
    }
    if (!limit && !lead) mem[pos][state] = res;
    return res;
}

long long count(long long x) {
    int len = 0;
    while (x) { digit[++len] = x % 10; x /= 10; }
    return dfs(len, 初始 state, true, true);
}
```

**为什么只在 !limit 时记忆化**：贴着上界时，可选的数字受 x 限制，结果只对这个 x 有效；不贴上界时，后面 pos 位可以任意填 00…0～99…9，结果和 x 无关，可以复用。

## 4. 例题：windy 数（P2657）

不含前导零且**相邻两位数字之差至少为 2** 的正整数叫 windy 数。求 [A, B] 中的个数。

state = 上一位填的数字。

```cpp
long long dfs(int pos, int last, bool limit, bool lead) {
    if (pos == 0) return lead ? 0 : 1;                // 全是前导零即数字 0，不算
    if (!limit && !lead && mem[pos][last] != -1) return mem[pos][last];
    int up = limit ? digit[pos] : 9;
    long long res = 0;
    for (int d = 0; d <= up; d++) {
        if (!lead && abs(d - last) < 2) continue;    // 有前导零时，上一位不算数
        res += dfs(pos - 1, d, limit && d == up, lead && d == 0);
    }
    if (!limit && !lead) mem[pos][last] = res;
    return res;
}
```

**前导零为什么重要**：数字 35 写成 "035"，0 和 3 的差是 3 ≥ 2 没问题；但 "013" 中 0 和 1 差 1，如果不处理前导零就会错误地排除 13。

## 5. 例题：数字计数（P2602）

求 [a, b] 中，0～9 每个数字各出现了多少次。

对每个数字 d 分别算一遍。state = 到目前为止 d 出现了几次，到 pos == 0 时返回这个次数（而不是 1）。

```cpp
long long dfs(int pos, int cnt, bool limit, bool lead, int target) {
    if (pos == 0) return cnt;
    // mem[pos][cnt]，对每个 target 重新清空
    ...
    for (int d = 0; d <= up; d++) {
        int nc = cnt + (d == target && !(lead && d == 0));   // 前导零不计入 0 的个数
        res += dfs(pos - 1, nc, limit && d == up, lead && d == 0, target);
    }
}
```

## 6. 例题：烦人的数学作业（P4999）

求 [L, R] 中所有数的**数位之和**，对 10⁹+7 取模。state = 当前数位和；或者换一种方式，让 dfs 返回"后面所有可能的填法的数位和总和"以及"填法的个数"。

## 7. 例题：花神的数论题（P4317）

sum(i) 表示 i 的二进制中 1 的个数，求 sum(1) × sum(2) × … × sum(N)，N ≤ 10¹⁵。

**换个角度**：用二进制数位 DP 求出"二进制中恰好有 k 个 1 的数"的个数 cnt[k]（k ≤ 50），答案 = Π k^cnt[k]，用快速幂。

> 乘积不好直接 DP 时，先**分组计数**再用快速幂合并。注意 cnt[k] 可能很大（到 10¹⁵），作为快速幂的指数时直接用 long long，不要对模数取模。本题模数 10000007 不是质数，也不能用费马小定理缩小指数。

## 8. 易错点清单

1. 忘记处理前导零。
2. 在 limit 为真时也记忆化（或读取记忆化），导致答案错误。
3. L = 0 时 count(L - 1) = count(-1)，要特殊处理。
4. 多个询问 / 多个 target 之间没有清空记忆化数组（如果记忆化的含义和它们有关）。
5. 数位从低到高存，搜索从高到低，下标别搞反。

## 9. 练习指引

**基础题**

- P2602 数字计数：每个数字分别做一次。
- P2657 windy 数：经典入门。

**进阶题**

- P4999 烦人的数学作业：求数位和。
- P4317 花神的数论题：二进制数位 DP + 快速幂。

## 10. 自测

1. 为什么答案可以写成 count(R) - count(L-1)？
2. limit 为真时为什么不能记忆化？
3. windy 数中，前导零的作用是什么？

<details><summary>答案</summary>

1. count(x) 是 [0, x] 中的个数，相减就是 [L, R]。
2. 贴着上界时可填的数字受 x 限制，结果不能复用。
3. 前导零期间"上一位"不存在，不应该参与相邻差的判断。

</details>
