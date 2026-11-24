using System;

class Program
{
    static void Main()
    {
        int a = 5, b = 10;
        bool p = a > 3 && b < 20;
        bool q = a > 7 || b == 10;
        bool r = !(a == 5);
        Console.WriteLine(p);
        Console.WriteLine(q);
        Console.WriteLine(r);
        Console.WriteLine(p && !q || r);
        Console.WriteLine(a != b);
        Console.WriteLine(a >= 5 && a <= 5);
        bool t = true; bool f = false;
        Console.WriteLine(t & f);
        Console.WriteLine(t | f);
        Console.WriteLine(t ^ t);
    }
}
