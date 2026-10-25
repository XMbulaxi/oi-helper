# 线段树

> **学完能做到**：写出支持区间查询、单点修改的线段树；用懒标记实现区间修改；处理多种标记（加和乘）；用线段树维护区间最大子段和这类需要"合并信息"的问题。
> **前置知识**：二叉树、递归、分治。

---

## 1. 为什么需要线段树

树状数组很好写，但它擅长的是"前缀和"类信息。如果要**区间加 + 区间求最大值**、**区间乘**、**区间取反**、**区间最大子段和**……就需要更通用的**线段树**。

## 2. 结构

线段树是一棵二叉树，每个节点代表一个区间：

- 根代表 [1, n]。
- 节点 [l, r] 的左儿子代表 [l, mid]，右儿子代表 [mid+1, r]，mid = (l+r)/2。
- 叶子代表单个元素 [i, i]。

```
              [1,8]
          /          \
      [1,4]          [5,8]
     /     \        /     \
  [1,2]  [3,4]  [5,6]  [7,8]
  / \    / \    / \    / \
 1   2  3   4  5   6  7   8
```

用数组存（像堆一样）：节点 p 的儿子是 2p 和 2p+1。**数组开 4n**。

每个节点存这个区间的信息（和、最大值……）。

## 3. 建树、单点修改、区间查询

```cpp
long long a[N], t[N * 4];

void pushup(int p) { t[p] = t[2 * p] + t[2 * p + 1]; }   // 合并左右儿子

void build(int p, int l, int r) {
    if (l == r) { t[p] = a[l]; return; }
    int mid = (l + r) / 2;
    build(2 * p, l, mid);
    build(2 * p + 1, mid + 1, r);
    pushup(p);
}

void update(int p, int l, int r, int x, long long k) {   // a[x] += k
    if (l == r) { t[p] += k; return; }
    int mid = (l + r) / 2;
    if (x <= mid) update(2 * p, l, mid, x, k);
    else update(2 * p + 1, mid + 1, r, x, k);
    pushup(p);
}

long long query(int p, int l, int r, int ql, int qr) {   // [ql, qr] 的和
    if (ql <= l && r <= qr) return t[p];                 // 完全包含，直接返回
    int mid = (l + r) / 2;
    long long s = 0;
    if (ql <= mid) s += query(2 * p, l, mid, ql, qr);
    if (qr > mid) s += query(2 * p + 1, mid + 1, r, ql, qr);
    return s;
}
// 调用：build(1, 1, n); update(1, 1, n, x, k); query(1, 1, n, l, r);
```

**查询为什么是 O(log n)**：任何区间 [ql, qr] 最多被拆成 O(log n) 个完整节点（每层最多 2 个）。

## 4. 懒标记：区间修改

给 [l, r] 每个数加 k。如果一个个叶子去改，最坏 O(n)。

**懒标记**的思想：修改到一个**完全被包含**的节点时，只更新这个节点的值，然后在它身上打个标记"我的儿子们都还欠着 +k 没加"，**不往下走**。以后真正需要访问它的儿子时，再把标记**下传**。

```cpp
long long t[N * 4], tag[N * 4];

void apply(int p, int l, int r, long long k) {   // 给节点 p（区间 [l,r]）整体加 k
    t[p] += k * (r - l + 1);
    tag[p] += k;
}

void pushdown(int p, int l, int r) {
    if (tag[p]) {
        int mid = (l + r) / 2;
        apply(2 * p, l, mid, tag[p]);
        apply(2 * p + 1, mid + 1, r, tag[p]);
        tag[p] = 0;
    }
}

void update(int p, int l, int r, int ql, int qr, long long k) {
    if (ql <= l && r <= qr) { apply(p, l, r, k); return; }
    pushdown(p, l, r);                          // 往下走之前先下传
    int mid = (l + r) / 2;
    if (ql <= mid) update(2 * p, l, mid, ql, qr, k);
    if (qr > mid) update(2 * p + 1, mid + 1, r, ql, qr, k);
    pushup(p);
}

long long query(int p, int l, int r, int ql, int qr) {
    if (ql <= l && r <= qr) return t[p];
    pushdown(p, l, r);                          // 查询也要下传
    int mid = (l + r) / 2;
    long long s = 0;
    if (ql <= mid) s += query(2 * p, l, mid, ql, qr);
    if (qr > mid) s += query(2 * p + 1, mid + 1, r, ql, qr);
    return s;
}
```

这就是 P3372 线段树 1 的完整做法。区间修改和区间查询都是 O(log n)。

## 5. 多种标记：加和乘（P3373）

操作：区间乘 x、区间加 x、区间求和（模 p）。

两种标记 mul 和 add，**约定先乘后加**：节点的真实值 = 原值 × mul + add × 长度。

- 给节点乘 k：t × k，mul × k，**add × k**（之前欠的加法也要乘）。
- 给节点加 k：t + k × 长度，add + k。
- 下传：儿子的 mul ×= 父 mul，儿子的 add = 儿子 add × 父 mul + 父 add。

```cpp
void applyMul(int p, long long k) { t[p] = t[p] * k % MOD; mul[p] = mul[p] * k % MOD; add[p] = add[p] * k % MOD; }
void applyAdd(int p, int len, long long k) { t[p] = (t[p] + k * len) % MOD; add[p] = (add[p] + k) % MOD; }
void pushdown(int p, int l, int r) {
    int mid = (l + r) / 2;
    if (mul[p] != 1) { applyMul(2*p, mul[p]); applyMul(2*p+1, mul[p]); mul[p] = 1; }
    if (add[p]) { applyAdd(2*p, mid-l+1, add[p]); applyAdd(2*p+1, r-mid, add[p]); add[p] = 0; }
}
// 建树时所有 mul 初始化为 1
```

> 多种标记时，一定要先想清楚**标记之间的顺序**，以及新标记如何和旧标记合并。

## 6. 维护复杂信息：小白逛公园（P4513）

单点修改，询问区间**最大子段和**。

每个节点存 4 个值：

- sum：区间和
- lmax：从左端点开始的最大和
- rmax：到右端点结束的最大和
- ans：区间内最大子段和

合并左儿子 L 和右儿子 R：

```
sum  = L.sum + R.sum
lmax = max(L.lmax, L.sum + R.lmax)
rmax = max(R.rmax, R.sum + L.rmax)
ans  = max(L.ans, R.ans, L.rmax + R.lmax)
```

查询时把若干个节点的信息**按顺序合并**。

> 线段树能维护的信息，关键看能不能**从两个儿子 O(1) 合并出父亲**。

## 7. 其他例子

- **XOR 的艺术（P2574）**：01 串，区间取反（0 变 1、1 变 0），区间求 1 的个数。取反后 1 的个数 = 长度 - 原来的个数；标记是"是否取反"，两次取反抵消（异或）。
- **无聊的数列（P1438）**：区间加等差数列、单点查询。在差分数组上，等差数列变成区间加一个常数 + 两个端点修改。
- **I Hate It（P1531）**：单点修改（取较大值）、区间求最大值。

## 8. 易错点清单

1. 数组没开 4 倍。
2. 区间修改后忘了 pushup，或者往下走之前忘了 pushdown。
3. 懒标记下传时长度算错（左儿子 mid-l+1，右儿子 r-mid）。
4. 乘法标记初始化成 0。
5. 取模题中某处忘了取模，溢出。
6. 查询区间 [ql, qr] 和节点区间 [l, r] 的参数顺序写混。

## 9. 练习指引

**基础题**

- P3372 线段树 1：区间加、区间求和，懒标记模板。
- P1531 I Hate It：单点修改、区间最大值。
- P3373 线段树 2：加和乘两种标记。

**进阶题**

- P2574 XOR的艺术：区间取反。
- P1438 无聊的数列：差分 + 线段树。
- P4513 小白逛公园：维护最大子段和。

**建议**：线段树代码长，至少独立默写三遍 P3372，直到 10 分钟内无错写完。

## 10. 自测

1. 线段树数组为什么要开 4n？
2. 懒标记解决了什么问题？
3. 维护"区间最大值"支持区间加，标记下传时子节点的最大值怎么变？

<details><summary>答案</summary>

1. 线段树最深约 ⌈log₂n⌉ + 1 层，节点编号最大可接近 4n。
2. 区间修改时不必修改所有叶子，只修改 O(log n) 个节点，需要时再下传。
3. 最大值直接加上 k（区间里每个数都加 k，最大值也加 k）。

</details>
