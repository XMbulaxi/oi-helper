# 强连通分量、缩点与割点

> **学完能做到**：用 Tarjan 算法求有向图的强连通分量；把强连通分量缩成一个点得到 DAG 并在上面 DP；求无向图的割点。
> **前置知识**：DFS、拓扑排序与 DAG 上的 DP。

---

## 1. 强连通分量

有向图中，如果一组点**两两之间都能互相到达**，而且不能再加入其他点，这组点就叫一个**强连通分量（SCC）**。

```
1 → 2 → 3 → 1   （1、2、3 互相可达，是一个 SCC）
3 → 4 → 5 → 4   （4、5 是一个 SCC）
6               （单独一个点也是一个 SCC）
```

**为什么重要**：把每个 SCC 缩成一个点后，图会变成一个 **DAG**。很多有向图问题（有环、不好 DP）缩点后就能在 DAG 上用拓扑排序 + DP 解决。

## 2. Tarjan 算法

### 两个数组

- **dfn[u]**：DFS 第一次访问 u 的时间戳（第几个被访问的）。
- **low[u]**：从 u 出发，沿着 DFS 树的边往下走、最多再走**一条**指向栈中节点的边，能到达的**最小 dfn**。

### 核心判断

**如果 low[u] == dfn[u]，那么 u 是它所在 SCC 中第一个被访问的点**（"根"）。此时栈中从 u 往上的所有点构成一个 SCC。

### 代码

```cpp
int dfn[N], low[N], tim;
int stk[N], top; bool inStk[N];
int scc[N], sccCnt, sccSize[N];

void tarjan(int u) {
    dfn[u] = low[u] = ++tim;
    stk[++top] = u; inStk[u] = true;
    for (int v : g[u]) {
        if (!dfn[v]) {                       // 没访问过：递归，回来后用 low[v] 更新
            tarjan(v);
            low[u] = min(low[u], low[v]);
        } else if (inStk[v]) {               // 访问过且在栈中：是返祖边或横叉到当前 SCC
            low[u] = min(low[u], dfn[v]);
        }
        // 访问过但不在栈中：v 属于已经确定的其他 SCC，忽略
    }
    if (low[u] == dfn[u]) {                  // u 是 SCC 的根
        ++sccCnt;
        int x;
        do {
            x = stk[top--];
            inStk[x] = false;
            scc[x] = sccCnt;
            sccSize[sccCnt]++;
        } while (x != u);
    }
}
// 图可能不连通：for (int i = 1; i <= n; i++) if (!dfn[i]) tarjan(i);
```

O(n + m)。

### 例：The Cow Prom（P2863）

求点数大于 1 的强连通分量个数。Tarjan 后数一下 sccSize > 1 的有几个。

## 3. 缩点

1. 求出每个点属于哪个 SCC：scc[u]。
2. 对每条原图的边 u → v，如果 scc[u] ≠ scc[v]，在新图中连 scc[u] → scc[v]。
3. 新图是 DAG，每个新点的权值 = 对应 SCC 中所有点的权值之和。

### 例：缩点模板（P3387）

有向图，每个点有权值，求一条路径使经过的点权和最大（点和边都可以重复经过，但点权只算一次）。

在一个 SCC 内可以把所有点都走一遍，所以缩点后在 DAG 上求**最长路**（点权），用拓扑排序 + DP。

```cpp
for (int i = 1; i <= n; i++) if (!dfn[i]) tarjan(i);
for (int u = 1; u <= n; u++) {
    val[scc[u]] += a[u];
    for (int v : g[u])
        if (scc[u] != scc[v]) { ng[scc[u]].push_back(scc[v]); indeg[scc[v]]++; }
}
// 在 ng 上拓扑排序 + DP：f[x] = val[x] + max(f[pre])
```

### 例：受欢迎的牛（P2341）

如果 A 喜欢 B，B 喜欢 C，那么 A 也喜欢 C。求被**所有**牛喜欢的牛有多少头。

缩点后，DAG 中**出度为 0** 的点：

- 如果恰好有一个，那么它对应的 SCC 中所有牛都是答案。
- 如果有多个，说明它们互相不喜欢，答案为 0。

### 例：校园网络（P2812）

学校之间有单向网络。问：(1) 至少给几所学校发软件，才能让所有学校都收到？(2) 至少加几条边，才能让从任何学校发出都能到达所有学校？

缩点后：

1. 答案是入度为 0 的点数。
2. 答案是 max(入度为 0 的点数, 出度为 0 的点数)。特殊情况：如果整张图只有一个 SCC，答案是 0。

## 4. 割点

**无向图**中，删掉一个点后图的连通块变多，这个点叫**割点**。

Tarjan 求割点，dfn 和 low 的定义类似（无向图中 low[u] 用 dfn[v] 更新时不需要"在栈中"的判断）。

**判断 u 是割点**：

- u **不是** DFS 树的根：存在一个儿子 v 满足 **low[v] ≥ dfn[u]**（v 的子树不经过 u 就绕不回 u 上面）。
- u **是**根：u 在 DFS 树中有**两个或以上**的儿子。

```cpp
void tarjan(int u, int root) {
    dfn[u] = low[u] = ++tim;
    int child = 0;
    for (int v : g[u]) {
        if (!dfn[v]) {
            tarjan(v, root);
            low[u] = min(low[u], low[v]);
            if (low[v] >= dfn[u] && u != root) cut[u] = true;
            child++;
        } else {
            low[u] = min(low[u], dfn[v]);
        }
    }
    if (u == root && child >= 2) cut[u] = true;
}
```

**割边（桥）**：条件是 low[v] **>** dfn[u]（严格大于），而且要注意不能用"刚走过来的那条边"更新 low（重边时用边的编号判断）。

## 5. 易错点清单

1. 有向图 Tarjan 中，用 dfn[v] 更新 low[u] 时必须判断 v 在栈中。
2. 图不连通，只从 1 号点开始 Tarjan。
3. 缩点后新图中有重边：一般不影响拓扑 DP，但影响"度数"的统计时要去重或只判断有无。
4. 割点的根节点特判。
5. 割点和割边的条件（≥ 和 >）弄混。
6. 递归层数太深爆栈。

## 6. 练习指引

**基础题**

- P2863 The Cow Prom S：Tarjan 求 SCC。
- P3387 【模板】缩点：缩点 + DAG 最长路。
- P3388 【模板】割点（割顶）。

**进阶题**

- P2341 受欢迎的牛 G：缩点后看出度。
- P2812 校园网络：缩点后看入度和出度。

## 7. 自测

1. 为什么缩点后的图一定是 DAG？
2. Tarjan 中 low[u] == dfn[u] 意味着什么？
3. 割点判断中，根节点为什么要单独处理？

<details><summary>答案</summary>

1. 如果缩点后还有环，环上的几个 SCC 就能互相到达，应该合并成一个 SCC，矛盾。
2. u 无法到达比它更早访问的、还在栈中的点，u 是一个 SCC 中最早被访问的点。
3. 根没有父亲，low[v] ≥ dfn[root] 对任何儿子都成立，只有当它有两个以上儿子时，删掉它才会让儿子们分开。

</details>
