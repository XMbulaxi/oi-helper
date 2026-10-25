# 图的存储与遍历

> **学完能做到**：用邻接矩阵、邻接表、链式前向星存图；DFS 和 BFS 遍历图；用拓扑排序处理有先后关系的任务。
> **前置知识**：DFS、BFS、vector。

---

## 1. 图的概念

图由**点**（顶点）和**边**组成。树就是一种特殊的图。

- **无向图**：边没有方向，A—B 表示可以互相到达。
- **有向图**：边有方向，A→B 表示只能从 A 到 B。
- **带权图**：每条边有一个数值（长度、费用……）。
- **度**：和一个点相连的边数。有向图分入度（指进来的）和出度（指出去的）。
- **连通**：无向图中任意两点都有路径相连。
- **环**：从一个点出发，沿着边又回到它自己。
- **DAG**：有向无环图，很多 DP 和拓扑排序都在 DAG 上进行。

## 2. 存图的三种方法

### ① 邻接矩阵

`g[u][v] = 1`（或边权）表示有边 u→v。

```cpp
int g[505][505];
g[u][v] = w;
g[v][u] = w;   // 无向图
```

- 优点：简单，O(1) 判断两点之间有没有边。
- 缺点：空间 O(n²)，n = 10⁵ 时根本存不下；遍历一个点的邻居要 O(n)。
- **适用**：n ≤ 几千，比如 Floyd 算法。

### ② 邻接表（vector，最常用）

```cpp
vector<int> g[N];
g[u].push_back(v);
g[v].push_back(u);    // 无向图
// 遍历 u 的邻居
for (int v : g[u]) { ... }
```

带权：

```cpp
vector<pair<int, int>> g[N];    // {终点, 边权}
g[u].push_back({v, w});
for (auto [v, w] : g[u]) { ... }
```

空间 O(n + m)，遍历所有邻居 O(度数)。

### ③ 链式前向星（了解）

用数组模拟邻接表，速度更快，很多老代码这样写：

```cpp
int head[N], nxt[M], to[M], val[M], cnt;
void addEdge(int u, int v, int w) {
    to[++cnt] = v; val[cnt] = w;
    nxt[cnt] = head[u]; head[u] = cnt;
}
for (int e = head[u]; e; e = nxt[e]) { int v = to[e], w = val[e]; ... }
```

无向图边数组要开 2 倍。

## 3. 图的遍历

### DFS

```cpp
bool vis[N];
void dfs(int u) {
    vis[u] = true;
    cout << u << " ";
    for (int v : g[u]) if (!vis[v]) dfs(v);
}
```

### BFS

```cpp
void bfs(int s) {
    queue<int> q;
    q.push(s); vis[s] = true;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        cout << u << " ";
        for (int v : g[u]) if (!vis[v]) { vis[v] = true; q.push(v); }
    }
}
```

### 例：查找文献（P5318）

按编号从小到大访问邻居，分别输出 DFS 和 BFS 序。读完边后对每个 `g[u]` 排序即可。

## 4. 反向建图：图的遍历（P3916）

有向图，对每个点 v 求它能到达的点中编号最大的。

**正向想**：每个点都搜一遍，O(n(n+m))，超时。

**反向想**：把所有边反过来。从编号**最大**的点 n 开始 DFS，它能到的点（反图里）都是原图中能到 n 的点，它们的答案就是 n。然后从 n-1 开始搜还没标记的点……每个点只被标记一次，O(n + m)。

```cpp
// rg 是反图
void dfs(int u, int val) {
    if (ans[u]) return;
    ans[u] = val;
    for (int v : rg[u]) dfs(v, val);
}
for (int i = n; i >= 1; i--) dfs(i, i);
```

> 遇到"每个点能到达……"难以下手时，试试**反向建图**。

## 5. 拓扑排序

有向无环图中，把所有点排成一列，使每条边都从前面指向后面。例如课程有先修关系，拓扑序就是一种合法的上课顺序。

### Kahn 算法（BFS）

1. 统计每个点的入度。
2. 入度为 0 的点入队（没有前置条件，可以先做）。
3. 每次取出一个点，把它指向的点入度减 1；减到 0 就入队。
4. 出队顺序就是拓扑序。如果最后出队的点少于 n 个，说明图里有环。

```cpp
queue<int> q;
for (int i = 1; i <= n; i++) if (indeg[i] == 0) q.push(i);
vector<int> order;
while (!q.empty()) {
    int u = q.front(); q.pop();
    order.push_back(u);
    for (int v : g[u]) if (--indeg[v] == 0) q.push(v);
}
bool hasCycle = (int)order.size() < n;
```

### 拓扑排序 + DP：杂务（P1113）

每个杂务有完成时间和前置杂务，可以并行，求全部完成的最短时间。

f[v] = 完成 v 的最早时间 = len[v] + max(f[u])（u 是 v 的前置）。按拓扑序计算：

```cpp
for (int i = 1; i <= n; i++) {
    f[i] = len[i];                 // 没有前置时，完成时间就是自己的用时
    if (indeg[i] == 0) q.push(i);
}
while (!q.empty()) {
    int u = q.front(); q.pop();
    for (int v : g[u]) {
        f[v] = max(f[v], f[u] + len[v]);   // 等最晚完成的前置做完再做 v
        if (--indeg[v] == 0) q.push(v);
    }
}
// 答案 = max(f[i])
```

### 例：最大食物链计数（P4017）

食物网是 DAG，求从生产者（入度 0）到最高级消费者（出度 0）的路径条数。

拓扑排序时累加：cnt[v] += cnt[u]，入度为 0 的点 cnt = 1。答案是所有出度为 0 的点的 cnt 之和，对 80112002 取模。

### 例：最长路（P1807）

DAG 上求 1 到 n 的最长路径。按拓扑序 DP：dis[v] = max(dis[u] + w)。注意只从 1 能到达的点才参与（可以把 dis 初始化为 -∞，dis[1] = 0）。

## 6. 易错点清单

1. 无向图只加了一个方向的边。
2. 大图用邻接矩阵，内存超限。
3. 链式前向星无向图的边数组没开 2 倍。
4. 拓扑排序中忘了处理"从起点到不了的点"（最长路问题里它们也会入队，要排除）。
5. 递归 DFS 遍历大图栈溢出。

## 7. 练习指引

**基础题**

- P5318 查找文献：见上文。
- P3916 图的遍历：反向建图。
- P1113 杂务：拓扑排序 + DP。

**进阶题**

- P4017 最大食物链计数：拓扑排序上计数。
- P1807 最长路：DAG 上求最长路。

## 8. 自测

1. n = 10⁵、m = 2×10⁵ 的图，适合用什么存？
2. 拓扑排序后发现只排出了 n-2 个点，说明什么？
3. 无向图存成邻接表，每条边会被存几次？

<details><summary>答案</summary>

1. 邻接表（vector 或链式前向星）。
2. 图中有环（剩下的点在环上或依赖环上的点）。
3. 2 次（u→v 和 v→u 各一次）。

</details>
