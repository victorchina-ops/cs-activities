using System;

class Program
{
    static void Main()
    {
        double x = 3.14159; int n = 42; bool t = true; string s = "hi";
        Console.WriteLine("{0} + {1} = {2}", 1, 2, 3);
        Console.WriteLine("{0:F2} and {1:F0}", x, 2.5);
        Console.WriteLine("[{0,6}] [{0,-6}] [{1,8:F1}]", n, x);
        Console.WriteLine("{{literal}} {0}", n);
        Console.WriteLine("{0} {1} {2} {3}", t, s, 'c', x);
        Console.WriteLine("{0:N2} {1:N0} {2:D5} {3:P1} {4:E2}", 1234567.891, 9876543, 42, 0.256, 12345.678);
        Console.WriteLine("{0:0.00} {1:#.#} {2:000}", 2.675, 0.05, 7);
        Console.WriteLine("{0:F2}", 2.675);
        Console.WriteLine("{0:F2} {1:F0} {2:F0} {3:F1}", 0.125, 0.5, 1.5, 0.25);
        Console.WriteLine("{0:X} {0:x4}", 255);
        Console.WriteLine(string.Format("{0}-{1}", "a", 5));
        Console.WriteLine(x.ToString("F1") + n.ToString() + t.ToString());
        Console.WriteLine("{0:F2} {1:F2} {2:F2}", -0.001, 99.995, 1e21);
    }
}
