using System;

class Program
{
    static void Main()
    {
        int x = 5;
        int y = x++;
        int z = ++x;
        Console.WriteLine(x + " " + y + " " + z);
        Console.WriteLine(x--);
        Console.WriteLine(--x);
        double d = 1.5; d++; Console.WriteLine(d);
        int a = 3;
        int b = a++ + ++a;
        Console.WriteLine(a + " " + b);
    }
}
