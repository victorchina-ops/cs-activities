using System;

class Program
{
    static void Main()
    {
        int a;
        if (Console.ReadLine() == "x") a = 1; else a = 2;
        Console.WriteLine(a);
        int b;
        if (true) b = 1;
        Console.WriteLine(b);
        int c;
        while (true) { c = 3; break; }
        Console.WriteLine(c);
        int d, e;
        d = e = 9;
        Console.WriteLine(d + e);
    }
}
