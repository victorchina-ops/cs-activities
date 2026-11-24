using System;

class Program
{
    static void Main()
    {
        int x = 5;
        Console.WriteLine(-x);
        Console.WriteLine(+x);
        Console.WriteLine(-(-x));
        Console.WriteLine(!true);
        Console.WriteLine(-2147483648);
        Console.WriteLine(~x);
        Console.WriteLine(5 << 2);
        Console.WriteLine(-17 >> 2);
        Console.WriteLine(6 & 3 | 8 ^ 1);
        double d = -2.5;
        Console.WriteLine(-d);
        Console.WriteLine(- -x);
        int m = int.MinValue;
        Console.WriteLine(m);
    }
}
