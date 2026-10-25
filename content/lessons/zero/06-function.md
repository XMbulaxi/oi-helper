# 函数与结构体

> **学完能做到**：把重复的代码写成函数；用结构体把一个对象的多项信息放在一起；按自定义规则排序。
> **前置知识**：数组、字符串。

---

## 1. 函数：给一段代码起个名字

数学里 f(x) = x² 是"给一个数，返回它的平方"。C++ 的函数一样：

```cpp
返回类型 函数名(参数列表) {
    做事情
    return 返回值;
}
```

例：

```cpp
int square(int x) {
    return x * x;
}

int main() {
    cout << square(5);   // 25
}
```

### 为什么要写函数

1. **避免重复**：判断质数要用 10 次，写一个 `isPrime` 就够了。
2. **好检查**：每个函数只做一件事，出错了容易定位。
3. **好阅读**：`if (isPrime(x))` 一看就懂。

### 没有返回值：void

```cpp
void printLine(int n) {
    for (int i = 0; i < n; i++) cout << "-";
    cout << endl;
}
```

### 返回 bool：判断类函数

```cpp
bool isLeap(int y) {
    return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
}
```

## 2. 参数是怎么传的

### 传值（默认）：函数拿到的是**复印件**

```cpp
void add(int x) { x++; }
int a = 1;
add(a);
cout << a;   // 还是 1！函数里改的是复印件
```

### 传引用：函数拿到的是**原件**

在参数类型后面加 `&`：

```cpp
void add(int &x) { x++; }
int a = 1;
add(a);
cout << a;   // 2
```

**什么时候用引用**：

- 函数需要修改外面的变量（例如 `swap`）。
- 参数很大（例如一个很长的 `string`），复制一份很慢。只读不改时写成 `const string &s`。

### 全局变量

定义在所有函数外面的变量，每个函数都能直接用。竞赛里常把数组、n、m 这些写成全局的，函数就不用传一堆参数了。

## 3. 局部变量与作用域

函数里定义的变量只在这个函数里有效，函数结束就消失。不同函数里的同名变量互不影响。

```cpp
int f() { int x = 1; return x; }
int g() { int x = 2; return x; }   // 和 f 里的 x 没关系
```

## 4. 结构体：把相关数据打包

一个学生有姓名、语文、数学、英语四项信息。用四个数组也行，但排序时要同时交换四个数组，很容易出错。结构体把它们打成一个包：

```cpp
struct Student {
    string name;
    int chinese, math, english;

    int total() {            // 结构体里也可以写函数
        return chinese + math + english;
    }
};

Student s[1005];

int main() {
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++)
        cin >> s[i].name >> s[i].chinese >> s[i].math >> s[i].english;
    cout << s[1].name << " 的总分是 " << s[1].total();
}
```

用 `.` 访问结构体里的成员：`s[i].name`。

## 5. 按自定义规则排序

`sort` 可以接收一个**比较函数** `cmp(a, b)`：如果 a 应该排在 b **前面**，就返回 `true`。

例：总分高的在前；总分相同，名字字典序小的在前。

```cpp
bool cmp(Student a, Student b) {
    if (a.total() != b.total()) return a.total() > b.total();
    return a.name < b.name;
}

sort(s + 1, s + n + 1, cmp);
```

> ⚠️ 比较函数里**只能用 `<` 或 `>`，不能用 `<=` 或 `>=`**。`a` 和 `b` 相等时必须返回 `false`，否则 `sort` 可能崩溃（RE）。

## 6. 递归初体验

函数可以调用它自己，这叫**递归**。

### 阶乘

n! = n × (n-1)!，而 1! = 1：

```cpp
long long fact(int n) {
    if (n == 1) return 1;       // 出口：最简单的情况
    return n * fact(n - 1);     // 把问题变小
}
```

fact(4) 的过程：

```
fact(4) = 4 * fact(3)
        = 4 * 3 * fact(2)
        = 4 * 3 * 2 * fact(1)
        = 4 * 3 * 2 * 1 = 24
```

写递归一定要想清楚两件事：**出口**（什么时候直接返回）和**怎么变小**。没有出口就会无限调用下去，最后栈溢出。

### 例题：赦免战俘（P5461）

2ⁿ × 2ⁿ 的方阵，把它分成四块，左上角的一块全部赦免（填 0），剩下三块各自再用同样的方法处理，直到方块大小为 1。

```cpp
int a[1100][1100];

// 处理以 (x, y) 为左上角、边长为 len 的正方形
void solve(int x, int y, int len) {
    if (len == 1) return;              // 出口
    int h = len / 2;
    for (int i = x; i < x + h; i++)    // 左上角全部赦免
        for (int j = y; j < y + h; j++)
            a[i][j] = 0;
    solve(x, y + h, h);                // 右上
    solve(x + h, y, h);                // 左下
    solve(x + h, y + h, h);            // 右下
}
// 一开始把整个方阵填 1，再调用 solve(1, 1, 1 << n)
```

这种"大问题分成几个同样的小问题"的思想叫**分治**，以后会大量用到。

## 7. 例题精讲：质数筛（P5736）

输入 n 个数，输出其中的质数。把判断写成函数：

```cpp
bool isPrime(int x) {
    if (x < 2) return false;
    for (int i = 2; i * i <= x; i++)
        if (x % i == 0) return false;
    return true;
}

int main() {
    int n; cin >> n;
    for (int i = 1; i <= n; i++) {
        int x; cin >> x;
        if (isPrime(x)) cout << x << " ";
    }
}
```

## 8. 易错点清单

1. 有返回值的函数，某条路径上忘了 `return`，结果是随机值。
2. 想在函数里修改参数却没加 `&`。
3. 比较函数用了 `<=` 或 `>=`。
4. 递归没有出口或出口写错。
5. 函数要写在 `main` **前面**（或者先声明），否则编译器不认识。

## 9. 练习指引

**基础题**

- P5735 距离函数：写 `double dist(x1, y1, x2, y2)`，三角形周长 = 三边之和。
- P5736 质数筛：见例题。
- P5737 闰年展示：写 `isLeap`。
- P5738 歌唱比赛：去掉最高分和最低分求平均。
- P5739 计算阶乘：题目要求用递归。

**进阶题**

- P5461 赦免战俘：见例题。
- P5740 最厉害的学生：结构体，找总分最高的（相同时取第一个）。
- P5741 旗鼓相当的对手（加强版）：结构体 + 两两比较，注意输出时按输入顺序，名字字典序小的在前。
- P5742 评等级：结构体里写一个判断"优秀"的函数，注意综合分数要用小数（或者乘 10 变整数比较）。
- P1304 哥德巴赫猜想：每个偶数拆成两个质数之和，第一个质数尽量小。写好 `isPrime`，从小往大试。

## 10. 自测

1. 下面的 `swap` 能交换 a 和 b 吗？为什么？
   ```cpp
   void mySwap(int x, int y) { int t = x; x = y; y = t; }
   ```
2. 比较函数 `return a.score >= b.score;` 有什么问题？
3. 递归函数必须有什么？

<details><summary>答案</summary>

1. 不能。传的是复印件，要写成 `int &x, int &y`。
2. 相等时返回了 true，`sort` 可能出错。要用 `>`。
3. 出口（递归终止条件）。

</details>
